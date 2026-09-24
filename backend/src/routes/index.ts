import { Router, type Request, type Response } from 'express';
import { healthController } from '../controllers/healthController';

const router = Router();

router.get('/health', (_req: Request, res: Response) => healthController(_req, res));

export default router;
