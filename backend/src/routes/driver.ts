import { Router } from 'express';
import {
  advanceRideHandler,
  getActivePoolsHandler,
  getAvailableDriversHandler,
  getDriverLocationHandler,
  updateDriverLocationHandler,
} from '../controllers/driverController';
import { requireAuth, requireRole } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { advanceRideSchema, updateDriverLocationSchema } from '../utils/validation';

const router = Router();

router.get(
  '/pools/active',
  requireAuth,
  requireRole('DRIVER'),
  asyncHandler(getActivePoolsHandler),
);
router.patch(
  '/rides/:rideRequestId/advance',
  requireAuth,
  requireRole('DRIVER'),
  validate(advanceRideSchema),
  asyncHandler(advanceRideHandler),
);
router.get(
  '/location',
  requireAuth,
  requireRole('DRIVER'),
  asyncHandler(getDriverLocationHandler),
);
router.patch(
  '/location',
  requireAuth,
  requireRole('DRIVER'),
  validate(updateDriverLocationSchema),
  asyncHandler(updateDriverLocationHandler),
);
router.get(
  '/available',
  requireAuth,
  asyncHandler(getAvailableDriversHandler),
);

export default router;
