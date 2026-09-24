import { Router } from 'express';
import { advancePoolHandler, getActivePoolsHandler } from '../controllers/driverController';
import { requireAuth, requireRole } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { advancePoolSchema } from '../utils/validation';

const router = Router();

router.get(
  '/pools/active',
  requireAuth,
  requireRole('DRIVER'),
  asyncHandler(getActivePoolsHandler),
);
router.patch(
  '/pools/:id/advance',
  requireAuth,
  requireRole('DRIVER'),
  validate(advancePoolSchema),
  asyncHandler(advancePoolHandler),
);

export default router;
