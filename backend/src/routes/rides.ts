import { Router } from 'express';
import {
  cancelRideHandler,
  createRideHandler,
  getRide,
  listRides,
} from '../controllers/rideController';
import { requireAuth, requireRole } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { cancelRideSchema, createRideSchema } from '../utils/validation';

const router = Router();

router.post(
  '/',
  requireAuth,
  requireRole('PASSENGER'),
  validate(createRideSchema),
  asyncHandler(createRideHandler),
);
router.get('/', requireAuth, asyncHandler(listRides));
router.get('/:id', requireAuth, asyncHandler(getRide));
router.patch(
  '/:id/cancel',
  requireAuth,
  requireRole('PASSENGER'),
  validate(cancelRideSchema),
  asyncHandler(cancelRideHandler),
);

export default router;
