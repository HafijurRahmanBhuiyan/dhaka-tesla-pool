import { Router } from 'express';
import { me } from '../controllers/userController';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/me', requireAuth, asyncHandler(me));

export default router;
