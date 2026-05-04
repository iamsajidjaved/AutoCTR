const { pool } = require('../models/db');

/**
 * Aggregate analytics for a user's dashboard overview.
 * All times bucketed in Asia/Dubai timezone (matches scheduler).
 */
async function getOverview(userId) {
  const client = await pool.connect();
  try {
    // Campaign-level counts by status
    const campaignCounts = await client.query(
      `SELECT status, COUNT(*)::int AS count
         FROM traffic_summaries
        WHERE user_id = $1
        GROUP BY status`,
      [userId]
    );

    // Aggregate visit counts by status (across all user campaigns)
    const visitCounts = await client.query(
      `SELECT td.status, td.type, td.device, COUNT(*)::int AS count
         FROM traffic_details td
         JOIN traffic_summaries ts ON ts.id = td.traffic_summary_id
        WHERE ts.user_id = $1
        GROUP BY td.status, td.type, td.device`,
      [userId]
    );

    // Avg dwell across all user campaigns
    const avgDwell = await client.query(
      `SELECT AVG(td.actual_dwell_seconds)::float AS avg
         FROM traffic_details td
         JOIN traffic_summaries ts ON ts.id = td.traffic_summary_id
        WHERE ts.user_id = $1
          AND td.actual_dwell_seconds IS NOT NULL`,
      [userId]
    );

    // Daily series — last 14 days, grouped by date in Asia/Dubai
    const dailySeries = await client.query(
      `SELECT
          (date_trunc('day', td.completed_at AT TIME ZONE 'Asia/Dubai'))::date AS day,
          COUNT(*) FILTER (WHERE td.status = 'completed' AND td.type = 'impression')::int AS impressions,
          COUNT(*) FILTER (WHERE td.status = 'completed' AND td.type = 'click')::int AS clicks,
          COUNT(*) FILTER (WHERE td.status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE td.status = 'failed')::int AS failed
         FROM traffic_details td
         JOIN traffic_summaries ts ON ts.id = td.traffic_summary_id
        WHERE ts.user_id = $1
          AND td.completed_at IS NOT NULL
          AND td.completed_at >= NOW() - INTERVAL '14 days'
        GROUP BY day
        ORDER BY day ASC`,
      [userId]
    );

    // Hourly heatmap — last 7 days × 24 hours
    const heatmap = await client.query(
      `SELECT
          EXTRACT(DOW FROM td.completed_at AT TIME ZONE 'Asia/Dubai')::int AS dow,
          EXTRACT(HOUR FROM td.completed_at AT TIME ZONE 'Asia/Dubai')::int AS hour,
          COUNT(*)::int AS count
         FROM traffic_details td
         JOIN traffic_summaries ts ON ts.id = td.traffic_summary_id
        WHERE ts.user_id = $1
          AND td.status = 'completed'
          AND td.completed_at >= NOW() - INTERVAL '7 days'
        GROUP BY dow, hour`,
      [userId]
    );

    // Top campaigns by completed visits
    const topCampaigns = await client.query(
      `SELECT ts.id, ts.keyword, ts.website, ts.status,
              ts.required_visits,
              COUNT(*) FILTER (WHERE td.status = 'completed')::int AS completed,
              COUNT(*) FILTER (WHERE td.status = 'failed')::int AS failed
         FROM traffic_summaries ts
         LEFT JOIN traffic_details td ON td.traffic_summary_id = ts.id
        WHERE ts.user_id = $1
        GROUP BY ts.id
        ORDER BY completed DESC
        LIMIT 6`,
      [userId]
    );

    // Recent visits (last 10 across all campaigns)
    const recentVisits = await client.query(
      `SELECT td.id, td.type, td.device, td.status, td.ip,
              td.completed_at, td.scheduled_at,
              ts.keyword, ts.id AS campaign_id
         FROM traffic_details td
         JOIN traffic_summaries ts ON ts.id = td.traffic_summary_id
        WHERE ts.user_id = $1
          AND td.status IN ('completed', 'failed')
        ORDER BY td.completed_at DESC NULLS LAST
        LIMIT 10`,
      [userId]
    );

    // Proxy / IP distribution — top 8 source IPs by completed visit count
    const proxyDistribution = await client.query(
      `SELECT td.ip, COUNT(*)::int AS count
         FROM traffic_details td
         JOIN traffic_summaries ts ON ts.id = td.traffic_summary_id
        WHERE ts.user_id = $1
          AND td.status = 'completed'
          AND td.ip IS NOT NULL
        GROUP BY td.ip
        ORDER BY count DESC
        LIMIT 8`,
      [userId]
    );

    return {
      campaignCounts: campaignCounts.rows,
      visitCounts: visitCounts.rows,
      avgDwellSeconds: avgDwell.rows[0]?.avg ?? null,
      dailySeries: dailySeries.rows,
      heatmap: heatmap.rows,
      topCampaigns: topCampaigns.rows,
      recentVisits: recentVisits.rows,
      proxyDistribution: proxyDistribution.rows,
    };
  } finally {
    client.release();
  }
}

module.exports = { getOverview };
