/**
 * Smart scheduling utility — generates organic-looking visit timestamps
 * weighted toward peak hours with jitter and a minimum gap between visits.
 */

const HOUR_MS = 60 * 60 * 1000;

/**
 * Compute the local hour (0-23) for a given UTC timestamp in a target IANA timezone.
 * Falls back to UTC hour if Intl is unavailable or the timezone is invalid.
 */
function getHourInTimezone(date, timezone) {
  if (!timezone) return date.getUTCHours();
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    });
    const parts = fmt.formatToParts(date);
    const h = parts.find(p => p.type === 'hour');
    const value = h ? parseInt(h.value, 10) : date.getUTCHours();
    // "24" sometimes appears for midnight in some ICU builds; normalize.
    return value === 24 ? 0 : value;
  } catch {
    return date.getUTCHours();
  }
}

/**
 * Distribute `count` items across buckets in proportion to their weights,
 * using the largest-remainder method so the totals exactly match `count`.
 */
function distributeByWeight(count, weights) {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    // Even spread fallback
    const base = Math.floor(count / weights.length);
    const result = weights.map(() => base);
    let remainder = count - base * weights.length;
    for (let i = 0; remainder > 0; i = (i + 1) % weights.length, remainder--) {
      result[i] += 1;
    }
    return result;
  }

  const exact = weights.map(w => (w / totalWeight) * count);
  const floors = exact.map(Math.floor);
  let assigned = floors.reduce((a, b) => a + b, 0);
  const remainders = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  let idx = 0;
  while (assigned < count) {
    floors[remainders[idx % remainders.length].i] += 1;
    assigned += 1;
    idx += 1;
  }
  return floors;
}

/**
 * Generate `count` Date objects between startAt and startAt + windowHours,
 * weighting peakHours more heavily and enforcing minGapSeconds between visits.
 *
 * @param {number} count
 * @param {object} [options]
 * @param {Date}   [options.startAt=new Date()]
 * @param {number} [options.windowHours=24]
 * @param {number[]} [options.peakHours=[9,13,18]]
 * @param {number} [options.peakWeight=3]
 * @param {number} [options.minGapSeconds=30]
 * @param {string} [options.timezone]   IANA timezone for peak hour interpretation
 * @returns {Date[]} sorted array of timestamps
 */
function generateTimestamps(count, options = {}) {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('count must be a non-negative integer');
  }
  if (count === 0) return [];

  const startAt = options.startAt instanceof Date ? options.startAt : new Date();
  const windowHours = options.windowHours ?? 24;
  const peakHours = options.peakHours ?? [9, 13, 18];
  const peakWeight = options.peakWeight ?? 3;
  const minGapSeconds = options.minGapSeconds ?? 30;
  const timezone = options.timezone;

  const minGapMs = minGapSeconds * 1000;
  const windowMs = windowHours * HOUR_MS;
  const peakSet = new Set(peakHours);

  // Build buckets — one per hour in the window.
  const bucketCount = Math.max(1, Math.ceil(windowHours));
  const weights = [];
  for (let b = 0; b < bucketCount; b++) {
    const bucketStart = new Date(startAt.getTime() + b * HOUR_MS);
    const hour = getHourInTimezone(bucketStart, timezone);
    weights.push(peakSet.has(hour) ? peakWeight : 1);
  }

  const perBucket = distributeByWeight(count, weights);

  // Spread visits inside each bucket randomly, with ±10% jitter.
  const timestamps = [];
  for (let b = 0; b < bucketCount; b++) {
    const n = perBucket[b];
    if (n === 0) continue;

    const bucketStart = startAt.getTime() + b * HOUR_MS;
    const jitterMs = HOUR_MS * 0.1;

    for (let i = 0; i < n; i++) {
      const baseOffset = Math.random() * HOUR_MS;
      const jitter = (Math.random() * 2 - 1) * jitterMs;
      let ts = bucketStart + baseOffset + jitter;
      // Clamp to window
      const minTs = startAt.getTime();
      const maxTs = startAt.getTime() + windowMs - 1;
      if (ts < minTs) ts = minTs;
      if (ts > maxTs) ts = maxTs;
      timestamps.push(ts);
    }
  }

  timestamps.sort((a, b) => a - b);

  // Enforce minimum gap by pushing forward any clustered timestamps.
  for (let i = 1; i < timestamps.length; i++) {
    const minAllowed = timestamps[i - 1] + minGapMs;
    if (timestamps[i] < minAllowed) {
      timestamps[i] = minAllowed;
    }
  }

  return timestamps.map(ms => new Date(ms));
}

module.exports = { generateTimestamps };
