// Device fingerprint pool — one profile = one fully-coherent identity.
//
// Every field below is consumed by puppeteerService to make the headless
// session indistinguishable from the named real device:
//   * userAgent          — sent in the User-Agent header AND injected via
//                          page.setUserAgent (so navigator.userAgent matches)
//   * viewport           — Puppeteer viewport (width/height/dpr/touch/mobile)
//   * platform           — overrides navigator.platform
//   * languages          — overrides navigator.languages (and Accept-Language)
//   * acceptLanguage     — exact value sent in the Accept-Language header
//   * timezone           — IANA tz used by page.emulateTimezone (Date.now() etc.)
//   * hardwareConcurrency, deviceMemory — patched onto navigator
//   * uaMetadata         — full Sec-CH-UA / userAgentData payload that Chrome
//                          sends with every request and exposes via
//                          navigator.userAgentData. MUST match userAgent.
//                          null = browser does not advertise userAgentData
//                          (Safari, Firefox, iOS).
//   * weight             — relative pick weight inside its (mobile/desktop)
//                          pool. Distribution roughly mirrors real-world
//                          Chrome / Safari / Edge market share for 2026.
//
// Versions are kept current to April 2026. Outdated UAs are an instant
// detection signal, so refresh this list when Chrome major bumps.

const desktopProfiles = [
  // Windows + Chrome 134 / 1920×1080 — most common desktop fingerprint
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080, isMobile: false, hasTouch: false },
    deviceScaleFactor: 1,
    platform: 'Win32',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'America/New_York',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    uaMetadata: {
      architecture: 'x86',
      bitness: '64',
      brands: [
        { brand: 'Chromium', version: '134' },
        { brand: 'Not(A:Brand', version: '24' },
        { brand: 'Google Chrome', version: '134' },
      ],
      fullVersion: '134.0.6998.118',
      fullVersionList: [
        { brand: 'Chromium', version: '134.0.6998.118' },
        { brand: 'Not(A:Brand', version: '24.0.0.0' },
        { brand: 'Google Chrome', version: '134.0.6998.118' },
      ],
      mobile: false,
      model: '',
      platform: 'Windows',
      platformVersion: '15.0.0',
      wow64: false,
    },
    weight: 30,
  },
  // Windows + Chrome 134 / 1366×768 (laptops, still widespread)
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768, isMobile: false, hasTouch: false },
    deviceScaleFactor: 1,
    platform: 'Win32',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'America/Chicago',
    hardwareConcurrency: 4,
    deviceMemory: 8,
    uaMetadata: {
      architecture: 'x86',
      bitness: '64',
      brands: [
        { brand: 'Chromium', version: '134' },
        { brand: 'Not(A:Brand', version: '24' },
        { brand: 'Google Chrome', version: '134' },
      ],
      fullVersion: '134.0.6998.166',
      fullVersionList: [
        { brand: 'Chromium', version: '134.0.6998.166' },
        { brand: 'Not(A:Brand', version: '24.0.0.0' },
        { brand: 'Google Chrome', version: '134.0.6998.166' },
      ],
      mobile: false,
      model: '',
      platform: 'Windows',
      platformVersion: '15.0.0',
      wow64: false,
    },
    weight: 20,
  },
  // Windows + Edge 134
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.3124.83',
    viewport: { width: 1536, height: 864, isMobile: false, hasTouch: false },
    deviceScaleFactor: 1.25,
    platform: 'Win32',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'America/Los_Angeles',
    hardwareConcurrency: 12,
    deviceMemory: 16,
    uaMetadata: {
      architecture: 'x86',
      bitness: '64',
      brands: [
        { brand: 'Chromium', version: '134' },
        { brand: 'Not(A:Brand', version: '24' },
        { brand: 'Microsoft Edge', version: '134' },
      ],
      fullVersion: '134.0.3124.83',
      fullVersionList: [
        { brand: 'Chromium', version: '134.0.6998.166' },
        { brand: 'Not(A:Brand', version: '24.0.0.0' },
        { brand: 'Microsoft Edge', version: '134.0.3124.83' },
      ],
      mobile: false,
      model: '',
      platform: 'Windows',
      platformVersion: '15.0.0',
      wow64: false,
    },
    weight: 12,
  },
  // macOS Apple Silicon + Chrome 134 (Retina DPR=2)
  {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900, isMobile: false, hasTouch: false },
    deviceScaleFactor: 2,
    platform: 'MacIntel',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'America/Los_Angeles',
    hardwareConcurrency: 10,
    deviceMemory: 8,
    uaMetadata: {
      architecture: 'arm',
      bitness: '64',
      brands: [
        { brand: 'Chromium', version: '134' },
        { brand: 'Not(A:Brand', version: '24' },
        { brand: 'Google Chrome', version: '134' },
      ],
      fullVersion: '134.0.6998.118',
      fullVersionList: [
        { brand: 'Chromium', version: '134.0.6998.118' },
        { brand: 'Not(A:Brand', version: '24.0.0.0' },
        { brand: 'Google Chrome', version: '134.0.6998.118' },
      ],
      mobile: false,
      model: '',
      platform: 'macOS',
      platformVersion: '14.5.0',
      wow64: false,
    },
    weight: 14,
  },
  // macOS + Safari 17.6 (no UA-CH — Safari does not send those headers)
  {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    viewport: { width: 1680, height: 1050, isMobile: false, hasTouch: false },
    deviceScaleFactor: 2,
    platform: 'MacIntel',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'America/Denver',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    uaMetadata: null,
    weight: 8,
  },
  // Windows + Firefox 125 (no UA-CH)
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    viewport: { width: 1600, height: 900, isMobile: false, hasTouch: false },
    deviceScaleFactor: 1,
    platform: 'Win32',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.5',
    timezone: 'America/New_York',
    hardwareConcurrency: 6,
    deviceMemory: 8,
    uaMetadata: null,
    weight: 6,
  },
  // Linux + Chrome 134 (small but real share)
  {
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080, isMobile: false, hasTouch: false },
    deviceScaleFactor: 1,
    platform: 'Linux x86_64',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'Europe/London',
    hardwareConcurrency: 8,
    deviceMemory: 16,
    uaMetadata: {
      architecture: 'x86',
      bitness: '64',
      brands: [
        { brand: 'Chromium', version: '134' },
        { brand: 'Not(A:Brand', version: '24' },
        { brand: 'Google Chrome', version: '134' },
      ],
      fullVersion: '134.0.6998.118',
      fullVersionList: [
        { brand: 'Chromium', version: '134.0.6998.118' },
        { brand: 'Not(A:Brand', version: '24.0.0.0' },
        { brand: 'Google Chrome', version: '134.0.6998.118' },
      ],
      mobile: false,
      model: '',
      platform: 'Linux',
      platformVersion: '6.5.0',
      wow64: false,
    },
    weight: 4,
  },
];

const mobileProfiles = [
  // iPhone 15 / iOS 17.6 Safari — dominant mobile UA
  {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    deviceScaleFactor: 3,
    platform: 'iPhone',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'America/New_York',
    hardwareConcurrency: 6,
    deviceMemory: 4,
    uaMetadata: null,
    weight: 25,
  },
  // iPhone 14 Pro / iOS 17.5
  {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    viewport: { width: 393, height: 852, isMobile: true, hasTouch: true },
    deviceScaleFactor: 3,
    platform: 'iPhone',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'America/Los_Angeles',
    hardwareConcurrency: 6,
    deviceMemory: 4,
    uaMetadata: null,
    weight: 18,
  },
  // iPhone 13 / iOS 16.7 (older but still common)
  {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.7 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    deviceScaleFactor: 3,
    platform: 'iPhone',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'America/Chicago',
    hardwareConcurrency: 6,
    deviceMemory: 4,
    uaMetadata: null,
    weight: 8,
  },
  // Pixel 8 / Android 14 + Chrome 134
  {
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915, isMobile: true, hasTouch: true },
    deviceScaleFactor: 2.625,
    platform: 'Linux armv81',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'America/New_York',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    uaMetadata: {
      architecture: '',
      bitness: '',
      brands: [
        { brand: 'Chromium', version: '134' },
        { brand: 'Not(A:Brand', version: '24' },
        { brand: 'Google Chrome', version: '134' },
      ],
      fullVersion: '134.0.6998.118',
      fullVersionList: [
        { brand: 'Chromium', version: '134.0.6998.118' },
        { brand: 'Not(A:Brand', version: '24.0.0.0' },
        { brand: 'Google Chrome', version: '134.0.6998.118' },
      ],
      mobile: true,
      model: 'Pixel 8',
      platform: 'Android',
      platformVersion: '14.0.0',
      wow64: false,
    },
    weight: 20,
  },
  // Samsung Galaxy S24 / Android 14 + Chrome 134
  {
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36',
    viewport: { width: 384, height: 832, isMobile: true, hasTouch: true },
    deviceScaleFactor: 2.8125,
    platform: 'Linux armv81',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'America/Los_Angeles',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    uaMetadata: {
      architecture: '',
      bitness: '',
      brands: [
        { brand: 'Chromium', version: '134' },
        { brand: 'Not(A:Brand', version: '24' },
        { brand: 'Google Chrome', version: '134' },
      ],
      fullVersion: '134.0.6998.135',
      fullVersionList: [
        { brand: 'Chromium', version: '134.0.6998.135' },
        { brand: 'Not(A:Brand', version: '24.0.0.0' },
        { brand: 'Google Chrome', version: '134.0.6998.135' },
      ],
      mobile: true,
      model: 'SM-S921B',
      platform: 'Android',
      platformVersion: '14.0.0',
      wow64: false,
    },
    weight: 18,
  },
  // Samsung Galaxy A54 / Android 13 (mid-range, very common globally)
  {
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36',
    viewport: { width: 384, height: 854, isMobile: true, hasTouch: true },
    deviceScaleFactor: 2.8125,
    platform: 'Linux armv81',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'Europe/London',
    hardwareConcurrency: 8,
    deviceMemory: 6,
    uaMetadata: {
      architecture: '',
      bitness: '',
      brands: [
        { brand: 'Chromium', version: '134' },
        { brand: 'Not(A:Brand', version: '24' },
        { brand: 'Google Chrome', version: '134' },
      ],
      fullVersion: '134.0.6998.118',
      fullVersionList: [
        { brand: 'Chromium', version: '134.0.6998.118' },
        { brand: 'Not(A:Brand', version: '24.0.0.0' },
        { brand: 'Google Chrome', version: '134.0.6998.118' },
      ],
      mobile: true,
      model: 'SM-A546B',
      platform: 'Android',
      platformVersion: '13.0.0',
      wow64: false,
    },
    weight: 11,
  },
];

function pickWeighted(profiles) {
  const total = profiles.reduce((s, p) => s + (p.weight || 1), 0);
  let r = Math.random() * total;
  for (const p of profiles) {
    r -= (p.weight || 1);
    if (r <= 0) return p;
  }
  return profiles[profiles.length - 1];
}

function getProfile(device) {
  const pool = device === 'mobile' ? mobileProfiles : desktopProfiles;
  return pickWeighted(pool);
}

module.exports = { getProfile, desktopProfiles, mobileProfiles };
