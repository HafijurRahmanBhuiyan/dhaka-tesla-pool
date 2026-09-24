import { Router } from 'express';
import { cancelRideHandler, createRideHandler, getRide } from '../controllers/rideController';
import { requireAuth, requireRole } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createRideSchema } from '../utils/validation';

const router = Router();

router.post(
  '/',
  requireAuth,
  requireRole('PASSENGER'),
  validate(createRideSchema),
  asyncHandler(createRideHandler),
);
router.get('/:id', requireAuth, asyncHandler(getRide));
router.patch('/:id/cancel', requireAuth, requireRole('PASSENGER'), asyncHandler(cancelRideHandler));

export default router;
