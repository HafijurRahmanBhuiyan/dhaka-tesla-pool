import { Router } from 'express';
import { getZones } from '../controllers/zoneController';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', asyncHandler(getZones));

export default router;
