const fs = require('fs');
require('dotenv').config();

const targetPath = './projects/case-management/src/environments/environment.ts';
const envConfigFile = `export const environment = {
  production: ${process.env.NODE_ENV === 'production'},
  firebase: {
    apiKey: "${process.env.FIREBASE_API_KEY}",
    authDomain: "${process.env.FIREBASE_AUTH_DOMAIN}",
    projectId: "${process.env.FIREBASE_PROJECT_ID}",
    storageBucket: "${process.env.FIREBASE_STORAGE_BUCKET}",
    messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID}",
    appId: "${process.env.FIREBASE_APP_ID}",
    measurementId: "${process.env.FIREBASE_MEASUREMENT_ID}"
  }
};
`;

fs.writeFileSync(targetPath, envConfigFile);
console.log(`Output generated at ${targetPath}`);
