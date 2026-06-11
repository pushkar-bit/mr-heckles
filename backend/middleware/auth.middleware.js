/**
 * @file requireAuth.js
 * @description Production JWT authentication middleware.
 * Verifies the Bearer token, decodes the payload, and attaches
 * it to req.user for downstream route handlers.
 */

import jwt from 'jsonwebtoken';

const requireAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please include a Bearer token.',
    });
  }

  const token = authHeader.slice(7).trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach decoded payload: { id, role, iat, exp }
    req.user = decoded;
    next();
  } catch (err) {
    const isExpired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      message: isExpired
        ? 'Your session has expired. Please log in again.'
        : 'Invalid authentication token.',
    });
  }
};

export default requireAuth;
