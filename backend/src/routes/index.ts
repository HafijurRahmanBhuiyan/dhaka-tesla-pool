import { Router, type Request, type Response } from 'express';
import { healthController } from '../controllers/healthController';

const router = Router();

router.get('/health', (_req: Request, res: Response) => healthController(_req, res));

// The frontend BFF always talks to the backend under /api/*; expose the health
// endpoint under that convention too so a BFF-scoped health check works.
router.get('/api/health', (_req: Request, res: Response) => healthController(_req, res));

export default router;
