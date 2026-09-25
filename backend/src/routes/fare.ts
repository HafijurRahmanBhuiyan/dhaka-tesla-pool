import { Router } from 'express';
import { getFareEstimateHandler } from '../controllers/fareController';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', asyncHandler(getFareEstimateHandler));

export default router;
