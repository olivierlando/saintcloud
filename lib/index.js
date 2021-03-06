#!/usr/bin/env node

// see these links for doc
// * implementation of the SDK: https://github.com/google/google-api-nodejs-client/blob/master/src/apis/appengine/v1.ts#L1300
// * credential creation in console: https://console.developers.google.com/apis/credentials
// *
const google = require('googleapis');
const appengine = google.appengine('v1');
const cloudresourcemanager = google.cloudresourcemanager('v1');
const async = require('async');
const readline = require('readline');
const auth = require('./auth');

// script args
const [node, script, 
  projectId=process.env.GCLOUD_PROJECT_ID, 
  keyFile=process.env.GCLOUD_KEY_FILE
] = process.argv;

const scopes = ['https://www.googleapis.com/auth/appengine.admin', 'https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/cloud-platform.read-only'];

auth(scopes, keyFile, (err) => {
  console.log('auth done', err);
  const getProjects = (cb) => {
    cloudresourcemanager.projects.list({
    }, null, (err, res) => {
      if(err) {
        cb("Couldn't retrieve projects", null);
      } else {
        if(projectId) cb(null, res.projects.filter(project => project.projectId === projectId));
        else cb(null, res.projects);
      }
    });
  };

  const getServices = (projects, cb) => {
    let pendingRequests = 0;
    projects.forEach(project => {
      pendingRequests++;
      appengine.apps.services.list({
        appsId: project.projectId,
      }, (err, resp) => {
        pendingRequests--;
        if(err) {
          if(err.code != 404) cb(err, null);
        } else {
          project.services = resp.services;
          if(pendingRequests === 0) {
            cb(null, projects);
          }
        }
      });
    });
  };

  const getVersions = (projects, cb) => {
    let pendingRequests = 0;
    projects.forEach(project => {
      project.services && project.services.forEach(service => {
        pendingRequests++;
        appengine.apps.services.versions.list({
          appsId: project.projectId,
          servicesId: service.id,
        }, (err, resp) => {
          pendingRequests--;
          if(err) {
            if(err.code != 404) cb(err, null);
          } else {
            service.versions = resp.versions;
            if(pendingRequests === 0) {
              cb(null, projects);
            }
          }
        });
      });
    });
  };

  const getInstances = (projects, cb) => {
    let pendingRequests = 0;
    projects.forEach(project => {
      project.services && project.services.forEach(service => {
        service.versions && service.versions.forEach(version => {
          pendingRequests++;
          appengine.apps.services.versions.instances.list({
            appsId: project.projectId,
            servicesId: service.id,
            versionsId: version.id,
          }, (err, resp) => {
            pendingRequests--;
            if(err) {
              if(err.code != 404) cb(err, null);
            } else {
              version.instances = resp.instances;
              if(pendingRequests === 0) {
                cb(null, projects);
              }
            }
          });
        });
      });
    });
  }

  console.log("Calling Google APIs...");

  async.waterfall([getProjects, getServices, getVersions, getInstances], (err, projects) => {
    const versionsWithNoInstance = [];

    projects.forEach(project => {
      project.services && project.services.forEach(service => {
        service.versions && service.versions.forEach(version => {
          if(!version.instances) {
            const age = Date.now() - new Date(version.createTime).getTime();
            //FIXME only add versions older than ??? days
            versionsWithNoInstance.push({
              projectId: project.projectId,
              serviceId: service.id,
              versionId: version.id,
              age
            });
          }
        });
      });
    });


    if(versionsWithNoInstance.length > 0) {
      console.log('Versions with no instances:');
      versionsWithNoInstance.forEach(v => {
        console.log(` - project: ${v.projectId}, service: ${v.serviceId}, version: ${v.versionId} (created ${v.age} seconds ago)`);
      })

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('Do you want to delete these versions? (y/N) ', (answer) => {
        rl.close();

        if(answer === 'Y' || answer === 'y') {
          console.log("Deleting versions...");

          const deletionPromises = versionsWithNoInstance.map(v => new Promise((resolve, reject) => {
            appengine.apps.services.versions.delete({
              appsId: v.projectId,
              servicesId: v.serviceId,
              versionsId: v.versionId,
            }, (err, resp) => {
              if(err) {
                resolve({status: 'error', err, version: v});
              } else {
                resolve({status: 'success'});
              }
            });
          }));

          Promise.all(deletionPromises).then(results => {
            const successesCount = results.filter(result => result.status === 'success').length;
            console.log(`${successesCount} versions successfully deleted`);

            const errors = results.filter(result => result.status === 'error');
            if(errors.length > 0) {
              console.log(`${errors.length} errors:`);
              errors.forEach(error => {
                console.log(` - project: ${error.v.projectId}, service: ${error.v.serviceId}, version: ${error.v.versionId}: ${err}`);
              });
            }
          });

        } else {
          console.log('Ok, nothing deleted');
        }
      });
    } else {
      console.log('No versions without instance. Nothing to do...');
    }
  });
});

