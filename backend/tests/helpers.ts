import { prisma } from '../src/utils/prisma';
import type { RegisterInput } from '../src/utils/validation';

export const resetDb = async (): Promise<void> => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Tesla", "Pool", "RideRequest", "Fare", "RideStatusHistory", "User", "Zone" RESTART IDENTITY CASCADE;',
  );
};

export const passengerInput: RegisterInput = {
  name: 'John Rider',
  phone: '01711111110',
  email: 'john@test.dev',
  password: 'password123',
  role: 'PASSENGER',
};

export const driverInput: RegisterInput = {
  name: 'Sara Driver',
  phone: '01722222220',
  email: 'sara@test.dev',
  password: 'password123',
  role: 'DRIVER',
  tesla: { plateNickname: 'Bullet', seatCapacity: 4 },
};
