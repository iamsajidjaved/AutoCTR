const scheduler = require('../utils/scheduler');

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build visit rows for a single day slice.
 * dayStart: Date marking the beginning of this day's 24h window.
 */
function buildDayVisits(dayVisits, ctr, mobileDesktopRatio, dayStart) {
  if (dayVisits <= 0) return [];

  const dayClicks = Math.round(dayVisits * ctr / 100);
  const dayImpressions = dayVisits - dayClicks;
  const dayMobile = Math.round(dayVisits * mobileDesktopRatio / 100);
  const dayDesktop = dayVisits - dayMobile;

  const types = shuffle([
    ...Array(dayClicks).fill('click'),
    ...Array(dayImpressions).fill('impression'),
  ]);

  const devices = shuffle([
    ...Array(dayMobile).fill('mobile'),
    ...Array(dayDesktop).fill('desktop'),
  ]);

  const timestamps = scheduler.generateTimestamps(dayVisits, {
    startAt: dayStart,
    windowHours: 24,
    peakHours: [9, 13, 18],
    peakWeight: 3,
    minGapSeconds: 30,
  });

  return types.map((type, i) => ({
    type,
    device: devices[i],
    scheduledAt: timestamps[i],
  }));
}

/**
 * Multi-day mode: each day's visit count grows by daily_increase_pct (compound).
 * Day 0 = initial_daily_visits, Day 1 = round(initial * (1+pct/100)), etc.
 * Each day gets its own 24h scheduling window starting at NOW() + d*24h.
 */
function generateVisitsMultiDay(campaign) {
  const {
    initial_daily_visits,
    campaign_duration_days,
    daily_increase_pct,
    ctr,
    mobile_desktop_ratio,
  } = campaign;

  const now = new Date();
  const allVisits = [];

  for (let day = 0; day < campaign_duration_days; day++) {
    const dayVisits = Math.round(initial_daily_visits * Math.pow(1 + Number(daily_increase_pct) / 100, day));
    const dayStart = new Date(now.getTime() + day * 24 * 60 * 60 * 1000);
    allVisits.push(...buildDayVisits(dayVisits, ctr, mobile_desktop_ratio, dayStart));
  }

  return allVisits;
}

/**
 * Legacy single-day mode: flat distribution of required_visits across 24h.
 * Used for old campaigns without initial_daily_visits set.
 */
function generateVisitsSingleDay(campaign) {
  const { required_visits, ctr, mobile_desktop_ratio } = campaign;
  return buildDayVisits(required_visits, ctr, mobile_desktop_ratio, new Date());
}

/**
 * Entry point used by campaignService (activate + restart).
 * Detects mode from campaign fields.
 */
function generateVisits(campaign) {
  if (campaign.initial_daily_visits != null) {
    return generateVisitsMultiDay(campaign);
  }
  return generateVisitsSingleDay(campaign);
}

module.exports = { generateVisits };
