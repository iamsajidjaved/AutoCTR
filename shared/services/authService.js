const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const userModel = require('../models/userModel');

function signJwt(userId) {
  return jwt.sign({ sub: userId }, config.JWT_SECRET, { expiresIn: '7d' });
}

function stripHash(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

async function register({ email, password }) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error('Invalid email format');
    err.status = 400;
    throw err;
  }
  if (!password || password.length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.status = 400;
    throw err;
  }

  const existing = await userModel.findByEmail(email);
  if (existing) {
    const err = new Error('Email already in use');
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await userModel.create({ email, passwordHash });
  const token = signJwt(user.id);
  return { user: stripHash(user), token };
}

async function login({ email, password }) {
  const user = await userModel.findByEmail(email);
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const token = signJwt(user.id);
  return { user: stripHash(user), token };
}

module.exports = { register, login, signJwt };
