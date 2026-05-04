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
// returned as correct UTC instants, and APP_TIMEZONE is honored by all
// scheduling/analytics code via Intl APIs.
function withTimezone(url, tz) {
  if (!url || !tz) return url;
  const param = `options=${encodeURIComponent(`-c TimeZone=${tz}`)}`;
  return url.includes('?') ? `${url}&${param}` : `${url}?${param}`;
}

// Lazy initialization. `config.DATABASE_URL` throws when the env var is
// missing; deferring the read means `next build` (which imports route modules
// for static analysis) never trips the validation.
let _sql = null;
let _pool = null;

function getSql() {
  if (_sql) return _sql;
  const connectionString = withTimezone(config.DATABASE_URL, config.TIMEZONE);
  _sql = neon(connectionString);
  return _sql;
}

function getPool() {
  if (_pool) return _pool;
  const connectionString = withTimezone(config.DATABASE_URL, config.TIMEZONE);
  _pool = new Pool({ connectionString });
  // Belt-and-braces: also issue SET TIME ZONE on every fresh pool connection in
  // case the libpq `options` parameter is stripped by an upstream proxy.
  _pool.on('connect', client => {
    client.query(`SET TIME ZONE '${config.TIMEZONE}'`).catch(() => {});
  });
  return _pool;
}

// Proxy objects so existing call sites (`sql\`...\``, `pool.connect()`,
// `pool.query()`) keep working unchanged. The first method call materializes
// the underlying client.
const sql = new Proxy(function () {}, {
  apply(_t, _thisArg, args) { return getSql()(...args); },
  get(_t, prop) { return getSql()[prop]; },
});
const pool = new Proxy({}, {
  get(_t, prop) {
    const p = getPool();
    const v = p[prop];
    return typeof v === 'function' ? v.bind(p) : v;
  },
});

module.exports = { sql, pool };
