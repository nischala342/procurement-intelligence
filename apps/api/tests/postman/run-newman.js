/* eslint-disable */
// Runs the Postman collection with Newman and writes an HTML report to ./reports.
// Requires the API to be running (npm run dev:api) against a reachable MongoDB.
// Override the target with: BASE_URL=http://host:port npm run test:api
const fs = require('node:fs');
const path = require('node:path');
const newman = require('newman');

const reportsDir = path.join(__dirname, 'reports');
fs.mkdirSync(reportsDir, { recursive: true });

const envVars = [];
if (process.env.BASE_URL) envVars.push({ key: 'baseUrl', value: process.env.BASE_URL });
if (process.env.API_KEY) envVars.push({ key: 'apiKey', value: process.env.API_KEY });

newman.run(
  {
    collection: require('./collection.json'),
    environment: require('./local.env.json'),
    envVar: envVars,
    // multipart fixtures are shared with the seed scripts
    workingDir: path.resolve(__dirname, '../../../../scripts/seed/data/samples'),
    insecureFileRead: true,
    reporters: ['cli', 'htmlextra'],
    reporter: {
      htmlextra: {
        export: path.join(reportsDir, 'report.html'),
        title: 'Procurement Intelligence API Tests',
        browserTitle: 'PI API Tests',
      },
    },
    timeout: 60000,
    delayRequest: 25,
  },
  (err, summary) => {
    if (err) {
      console.error('Newman error:', err);
      process.exit(1);
    }
    console.log(`\nHTML report: ${path.join(reportsDir, 'report.html')}`);
    process.exit(summary.run.failures.length ? 1 : 0);
  },
);
