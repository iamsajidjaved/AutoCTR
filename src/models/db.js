const { neon, Pool } = require('@neondatabase/serverless');
const config = require('../config');

const sql = neon(config.DATABASE_URL);
const pool = new Pool({ connectionString: config.DATABASE_URL });

module.exports = { sql, pool };
