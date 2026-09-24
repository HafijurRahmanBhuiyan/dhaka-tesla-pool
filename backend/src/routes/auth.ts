import { Router } from 'express';
import { login, register } from '../controllers/authController';
import { validate } from '../middlewares/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { loginSchema, registerSchema } from '../utils/validation';

const router = Router();

router.post('/register', validate(registerSchema), asyncHandler(register));
router.post('/login', validate(loginSchema), asyncHandler(login));

export default router;
