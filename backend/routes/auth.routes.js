/**
 * @file auth.routes.js
 * @description Authentication route definitions.
 *
 *   POST /api/auth/register  — Public
 *   POST /api/auth/login     — Public
 *   GET  /api/auth/me        — Protected (valid JWT required)
 */

import { Router }   from 'express';
import requireAuth  from '../middleware/requireAuth.js';
import { register, login, getMe } from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', register);
router.post('/login',    login);
router.get('/me',        requireAuth, getMe);

export default router;
