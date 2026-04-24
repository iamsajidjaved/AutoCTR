const mobileProfiles = [
  {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    deviceScaleFactor: 3,
  },
  {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915, isMobile: true, hasTouch: true },
    deviceScaleFactor: 2.625,
  },
  {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    viewport: { width: 375, height: 812, isMobile: true, hasTouch: true },
    deviceScaleFactor: 3,
  },
];

const desktopProfiles = [
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768, isMobile: false, hasTouch: false },
    deviceScaleFactor: 1,
  },
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
    viewport: { width: 1440, height: 900, isMobile: false, hasTouch: false },
    deviceScaleFactor: 1,
  },
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800, isMobile: false, hasTouch: false },
    deviceScaleFactor: 2,
  },
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getProfile(device) {
  return device === 'mobile' ? pick(mobileProfiles) : pick(desktopProfiles);
}

module.exports = { getProfile };
