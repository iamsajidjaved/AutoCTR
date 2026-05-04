const { sql } = require('./db');

async function create({ userId, website, keyword, requiredVisits, ctr, mobileDesktopRatio, minDwellSeconds, maxDwellSeconds, campaignDurationDays, initialDailyVisits, dailyIncreasePct }) {
  const rows = await sql`
    INSERT INTO traffic_summaries
      (user_id, website, keyword, required_visits, ctr, mobile_desktop_ratio,
       min_dwell_seconds, max_dwell_seconds,
       campaign_duration_days, initial_daily_visits, daily_increase_pct)
    VALUES
      (${userId}, ${website}, ${keyword}, ${requiredVisits}, ${ctr}, ${mobileDesktopRatio},
       ${minDwellSeconds}, ${maxDwellSeconds},
       ${campaignDurationDays}, ${initialDailyVisits ?? null}, ${dailyIncreasePct ?? 0})
    RETURNING *
  `;
  return rows[0];
}

async function findAllByUser(userId) {
  return await sql`
    SELECT * FROM traffic_summaries
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
}

async function findById(id) {
  const rows = await sql`SELECT * FROM traffic_summaries WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

async function findByIdAndUser(id, userId) {
  const rows = await sql`
    SELECT * FROM traffic_summaries
    WHERE id = ${id} AND user_id = ${userId}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function updateStatus(id, status) {
  await sql`
    UPDATE traffic_summaries
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

async function deleteById(id) {
  await sql`DELETE FROM traffic_summaries WHERE id = ${id}`;
}

async function markCompleted(id) {
  const rows = await sql`
    UPDATE traffic_summaries
    SET status = 'completed', updated_at = NOW()
    WHERE id = ${id}
      AND status = 'running'
      AND NOT EXISTS (
        SELECT 1 FROM traffic_details
        WHERE traffic_summary_id = ${id}
          AND status IN ('pending', 'running')
      )
    RETURNING id
  `;
  return rows.length > 0;
}

async function pauseAndCancelJobs(id) {
  await sql`
    UPDATE traffic_details
    SET status = 'failed', error_message = 'Campaign paused', completed_at = NOW()
    WHERE traffic_summary_id = ${id}
      AND status IN ('pending', 'running')
  `;
  await sql`
    UPDATE traffic_summaries
    SET status = 'paused', updated_at = NOW()
    WHERE id = ${id}
  `;
}

module.exports = { create, findAllByUser, findById, findByIdAndUser, updateStatus, deleteById, markCompleted, pauseAndCancelJobs };
