const { neon, Pool } = require('@neondatabase/serverless');
const config = require('../config');

// Append `options=-c TimeZone=<tz>` to the libpq connection string so every
// session opened by Neon (HTTP `sql` and pooled `pool`) starts in the configured
// timezone (default Asia/Dubai). NOW(), CURRENT_TIMESTAMP and TIMESTAMPTZ output
// will all be expressed in Dubai local time.
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
