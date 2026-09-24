import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { signToken } from '../utils/jwt';
import type { RegisterInput } from '../utils/validation';
import { getProfile, type UserProfile } from './userService';

const BCRYPT_ROUNDS = 10;

export interface AuthResult {
  token: string;
  user: UserProfile;
}

export const authService = {
  async register(input: RegisterInput): Promise<UserProfile> {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { phone: input.phone }] },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(409, 'A user with this email or phone already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    try {
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: input.name,
            phone: input.phone,
            email: input.email,
            passwordHash,
            role: input.role,
          },
        });

        if (input.role === 'DRIVER') {
          await tx.tesla.create({
            data: {
              driverId: created.id,
              plateNickname: input.tesla!.plateNickname,
              seatCapacity: input.tesla!.seatCapacity,
            },
          });
        }

        return created;
      });

      return getProfile(user.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(409, 'A user with this email or phone already exists');
      }
      throw error;
    }
  },

  async login(identifier: string, password: string): Promise<AuthResult> {
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    });
    if (!user) {
      throw new ApiError(401, 'Invalid email/phone or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new ApiError(401, 'Invalid email/phone or password');
    }

    const token = signToken({ userId: user.id, role: user.role });
    return { token, user: await getProfile(user.id) };
  },
};
