const scheduler = require('../utils/scheduler');

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateVisits(campaign) {
  const totalVisits = campaign.required_visits;
  const totalClicks = Math.round(totalVisits * campaign.ctr / 100);
  const totalImpressions = totalVisits - totalClicks;
  const mobileCount = Math.round(totalVisits * campaign.mobile_desktop_ratio / 100);
  const desktopCount = totalVisits - mobileCount;

  const types = shuffle([
    ...Array(totalClicks).fill('click'),
    ...Array(totalImpressions).fill('impression'),
  ]);

  const devices = shuffle([
    ...Array(mobileCount).fill('mobile'),
    ...Array(desktopCount).fill('desktop'),
  ]);

  const timestamps = scheduler.generateTimestamps(totalVisits, {
    startAt: new Date(),
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

module.exports = { generateVisits };
