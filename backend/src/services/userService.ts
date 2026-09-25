import type { User } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';

export interface TeslaSummary {
  id: number;
  plateNickname: string;
  seatCapacity: number;
  isActive: boolean;
}

export interface UserProfile {
  id: number;
  name: string;
  phone: string;
  email: string;
  role: User['role'];
  createdAt: Date;
  locationZone?: { id: number; name: string } | null;
  teslas?: TeslaSummary[];
}

export const findById = async (id: number): Promise<User | null> => {
  return prisma.user.findUnique({ where: { id } });
};

export const getProfile = async (id: number): Promise<UserProfile> => {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      locationZone: { select: { id: true, name: true } },
      teslas: { select: { id: true, plateNickname: true, seatCapacity: true, isActive: true } },
    },
  });
  if (!user) throw new ApiError(404, 'User not found');

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    locationZone: user.locationZone,
    ...(user.role === 'DRIVER' ? { teslas: user.teslas } : {}),
  };
};
