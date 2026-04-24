const shoplike = require('../providers/shoplikeProxy');

// Add additional providers to this array as they are integrated.
// Each provider must export { getNewProxy() } returning { host, port, username, password, url }.
const PROVIDERS = [shoplike];

async function getProxy() {
  let lastError;
  for (const provider of PROVIDERS) {
    try {
      return await provider.getNewProxy();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('All proxy providers failed');
}

module.exports = { getProxy };
