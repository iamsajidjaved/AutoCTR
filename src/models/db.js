const { neon, Pool } = require('@neondatabase/serverless');
const config = require('../config');

// Append `options=-c TimeZone=<tz>` to the libpq connection string so every
// session opened by the WebSocket-based `pool` starts in the configured
// timezone (default Asia/Dubai). NOW(), CURRENT_TIMESTAMP and TIMESTAMPTZ output
// will all be expressed in Dubai local time on pooled connections.
//
// NOTE: Neon's HTTP REST endpoint (used by `sql`) silently strips the `options`
// parameter — each call is a stateless transaction, so `SHOW TimeZone` over the
// HTTP driver always reports `GMT`. Absolute TIMESTAMPTZ values are still
// returned as correct UTC instants, and the JS process itself runs in
// `Asia/Dubai` (process.env.APP_TIMEZONE is forced in src/config/index.js), so all
// application-level wall-clock arithmetic is consistent.
function withTimezone(url, tz) {
  if (!url || !tz) return url;
  const param = `options=${encodeURIComponent(`-c TimeZone=${tz}`)}`;
  return url.includes('?') ? `${url}&${param}` : `${url}?${param}`;
}

const connectionString = withTimezone(config.DATABASE_URL, config.TIMEZONE);

const sql = neon(connectionString);
const pool = new Pool({ connectionString });

// Belt-and-braces: also issue SET TIME ZONE on every fresh pool connection in
// case the libpq `options` parameter is stripped by an upstream proxy.
pool.on('connect', client => {
  client.query(`SET TIME ZONE '${config.TIMEZONE}'`).catch(() => {});
});

module.exports = { sql, pool };
