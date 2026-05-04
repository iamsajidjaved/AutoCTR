const { sql } = require('./db');

async function findByEmail(email) {
  const rows = await sql`SELECT * FROM users WHERE email = ${email} LIMIT 1`;
  return rows[0] || null;
}

async function findById(id) {
  const rows = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

async function create({ email, passwordHash }) {
  const rows = await sql`
    INSERT INTO users (email, password_hash)
    VALUES (${email}, ${passwordHash})
    RETURNING id, email, role, created_at
  `;
  return rows[0];
}

module.exports = { findByEmail, findById, create };
