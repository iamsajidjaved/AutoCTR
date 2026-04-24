const { sql, pool } = require('./db');

async function bulkCreate(rows, client) {
  const BATCH_SIZE = 500;
  const ownedClient = !client;
  if (!client) client = await pool.connect();
  try {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map((_, j) => {
        const base = j * 4;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      }).join(', ');
      const params = batch.flatMap(r => [r.trafficSummaryId, r.scheduledAt, r.type, r.device]);
      await client.query(
        `INSERT INTO traffic_details (traffic_summary_id, scheduled_at, type, device) VALUES ${placeholders}`,
        params
      );
    }
  } finally {
    if (ownedClient) client.release();
  }
}

/**
 * Atomically claim up to `limit` pending+due rows for this worker.
 *
 * The previous implementation ran `SELECT ... FOR UPDATE SKIP LOCKED` and
 * released the connection right away. Because pg releases row locks at the end
 * of the transaction (and an idle pooled connection is autocommit), the locks
 * were dropped immediately and multiple PM2 workers polling on the same tick
 * could observe the same rows. The status update to 'running' inside
 * processJob then ran outside any lock window — a real double-claim race.
 *
 * This UPDATE ... RETURNING wraps the SKIP LOCKED select inside a single
 * statement, so each row is both locked and flipped to 'running' atomically.
 * Only the worker that wins the lock sees the row in its RETURNING set.
 */
async function claimPendingDue(limit) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      WITH claimed AS (
        SELECT td.id
        FROM traffic_details td
        JOIN traffic_summaries ts ON ts.id = td.traffic_summary_id
        WHERE td.status = 'pending'
          AND td.scheduled_at <= NOW()
          AND ts.status = 'running'
        ORDER BY td.scheduled_at ASC
        LIMIT $1
        FOR UPDATE OF td SKIP LOCKED
      )
      UPDATE traffic_details td
      SET status = 'running', started_at = NOW()
      FROM claimed c, traffic_summaries ts
      WHERE td.id = c.id
        AND ts.id = td.traffic_summary_id
      RETURNING td.*, ts.min_dwell_seconds, ts.max_dwell_seconds, ts.website, ts.keyword
    `, [limit]);
    return rows;
  } finally {
    client.release();
  }
}

/**
 * Diagnostic counter — reports how many rows are pending vs. already running
 * across every active campaign. Used by the worker when its claim returns 0
 * to distinguish "no work due" from "all due rows are in flight".
 */
async function pendingDueStats() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE td.status = 'pending' AND td.scheduled_at <= NOW())::int AS pending_due,
        COUNT(*) FILTER (WHERE td.status = 'pending' AND td.scheduled_at > NOW())::int  AS pending_future,
        COUNT(*) FILTER (WHERE td.status = 'running')::int                                AS running
      FROM traffic_details td
      JOIN traffic_summaries ts ON ts.id = td.traffic_summary_id
      WHERE ts.status = 'running'
    `);
    return rows[0] || { pending_due: 0, pending_future: 0, running: 0 };
  } finally {
    client.release();
  }
}

async function updateStatus(id, status, { ip, startedAt, completedAt, actualDwellSeconds, errorMessage } = {}) {
  await sql`
    UPDATE traffic_details
    SET
      status = ${status},
      ip = ${ip ?? null},
      started_at = ${startedAt ?? null},
      completed_at = ${completedAt ?? null},
      actual_dwell_seconds = ${actualDwellSeconds ?? null},
      error_message = ${errorMessage ?? null}
    WHERE id = ${id}
  `;
}

async function countByStatus(summaryId) {
  const rows = await sql`
    SELECT status, COUNT(*)::int AS count
    FROM traffic_details
    WHERE traffic_summary_id = ${summaryId}
    GROUP BY status
  `;
  const result = { pending: 0, running: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    result[row.status] = row.count;
  }
  return result;
}

async function avgDwellSeconds(summaryId) {
  const rows = await sql`
    SELECT AVG(actual_dwell_seconds)::float AS avg
    FROM traffic_details
    WHERE traffic_summary_id = ${summaryId}
      AND actual_dwell_seconds IS NOT NULL
  `;
  return rows[0]?.avg ?? null;
}

/**
 * Page through visits for a campaign with optional filters.
 * Used by the dashboard's per-campaign Visits panel.
 *
 * @param {string} summaryId - traffic_summaries.id
 * @param {object} opts
 * @param {string} [opts.status] - one of pending|running|completed|failed
 * @param {string} [opts.type]   - impression|click
 * @param {string} [opts.device] - mobile|desktop
 * @param {number} [opts.limit=50]   - 1..200
 * @param {number} [opts.offset=0]
 * @param {string} [opts.sort='scheduled_at'] - scheduled_at|started_at|completed_at
 * @param {string} [opts.order='asc']         - asc|desc
 * @returns {Promise<{ rows: object[], total: number }>}
 */
async function listBySummary(summaryId, opts = {}) {
  const status = opts.status || null;
  const type = opts.type || null;
  const device = opts.device || null;
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const offset = Math.max(Number(opts.offset) || 0, 0);

  const sortable = new Set(['scheduled_at', 'started_at', 'completed_at']);
  const sort = sortable.has(opts.sort) ? opts.sort : 'scheduled_at';
  const order = String(opts.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const client = await pool.connect();
  try {
    const params = [summaryId];
    let where = `traffic_summary_id = $1`;
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    if (type)   { params.push(type);   where += ` AND type = $${params.length}`; }
    if (device) { params.push(device); where += ` AND device = $${params.length}`; }

    const totalRes = await client.query(
      `SELECT COUNT(*)::int AS total FROM traffic_details WHERE ${where}`,
      params
    );

    params.push(limit);
    params.push(offset);
    const rowsRes = await client.query(
      `SELECT id, scheduled_at, started_at, completed_at, type, device, status, ip,
              actual_dwell_seconds, error_message
         FROM traffic_details
        WHERE ${where}
        ORDER BY ${sort} ${order} NULLS LAST, id ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return { rows: rowsRes.rows, total: totalRes.rows[0].total };
  } finally {
    client.release();
  }
}

module.exports = { bulkCreate, claimPendingDue, pendingDueStats, updateStatus, countByStatus, avgDwellSeconds, listBySummary };
