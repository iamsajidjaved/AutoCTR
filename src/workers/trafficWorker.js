const workerService = require('../services/workerService');
const config = require('../config');

const POLL_INTERVAL_MS = 5000;

// Surface the resolved Puppeteer mode at startup so it's obvious from PM2
// logs whether browsers will be visible. If you expected to see Chromium
// windows but this prints `headless=true`, set HEADLESS=false in .env and
// restart with `pm2 restart all --update-env`.
console.log(
  `[worker-${process.pid}] starting | NODE_ENV=${config.NODE_ENV} | headless=${config.HEADLESS}`
);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let shuttingDown = false;
let inFlightPromise = Promise.resolve();

process.on('SIGTERM', () => {
  shuttingDown = true;
  inFlightPromise.then(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 30000);
});

async function run() {
  while (!shuttingDown) {
    const batchPromise = workerService.processBatch().catch(err => {
      console.error(`[worker-${process.pid}] batch error: ${err.message}`);
    });
    inFlightPromise = batchPromise;
    await batchPromise;
    if (!shuttingDown) await sleep(POLL_INTERVAL_MS);
  }
}

run();
