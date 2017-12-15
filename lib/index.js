// see these links for doc
// * implementation of the SDK: https://github.com/google/google-api-nodejs-client/blob/master/src/apis/appengine/v1.ts#L1300
// * credential creation in console: https://console.developers.google.com/apis/credentials
// *
const google = require('googleapis');
const appengine = google.appengine('v1');
const cloudresourcemanager = google.cloudresourcemanager('v1');
const async = require('async');

module.exports.getProjects = ({ projectId }, callback) => {
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

  async.waterfall([getProjects, getServices, getVersions, getInstances], callback);
};

module.exports.deleteVersions = (versions, callback) => {

  const deletionPromises = versions.map(v => new Promise((resolve, reject) => {
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
    const errors = results.filter(result => result.status === 'error');

    callback(successesCount, errors);
  });
};