const readline = require('readline');
const auth = require('./auth');
const saintcloud = require('./')

// script args
const [node, script, 
    projectId=process.env.GCLOUD_PROJECT_ID, 
    keyFile=process.env.GCLOUD_KEY_FILE
  ] = process.argv;
  
const scopes = ['https://www.googleapis.com/auth/appengine.admin', 'https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/cloud-platform.read-only'];

auth(scopes, keyFile, (err) => {
    saintcloud.getProjects({
        projectId,
    }, (err, projects) => {
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
    
              saintcloud.deleteVersions(versionsWithNoInstance, (successesCount, errors) => {
                console.log(`${successesCount} versions successfully deleted`);
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