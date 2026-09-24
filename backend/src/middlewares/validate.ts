import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

type ZodSchema = z.ZodTypeAny;

export const validate =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      }));
      res.status(400).json({ error: 'Validation failed', issues });
      return;
    }
    req.body = result.data;
    next();
  };
