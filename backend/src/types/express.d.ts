import type { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth after verifying the JWT. Always a full User row
      // (including passwordHash) so downstream middleware can trust the role.
      user?: User;
    }
  }
}

export {};
