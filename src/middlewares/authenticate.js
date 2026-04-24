const jwt = require('jsonwebtoken');
const config = require('../config');
const userModel = require('../models/userModel');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, config.JWT_SECRET);
    const user = await userModel.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { password_hash, ...safe } = user;
    req.user = safe;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = authenticate;
