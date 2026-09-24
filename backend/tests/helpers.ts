import { prisma } from '../src/utils/prisma';
import { authService } from '../src/services/authService';
import { signToken } from '../src/utils/jwt';
import type { RegisterInput } from '../src/utils/validation';

export const dhakaZoneNames = [
  'Banani',
  'Gulshan',
  'Mohakhali',
  'Dhanmondi',
  'Mirpur',
  'Uttara',
  'Farmgate',
  'Bashundhara',
] as const;

const zoneIds = new Map<string, number>();

export const seedZones = async (): Promise<Map<string, number>> => {
  for (const name of dhakaZoneNames) {
    const zone = await prisma.zone.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    zoneIds.set(name, zone.id);
  }
  return zoneIds;
};

export const resetDb = async (): Promise<void> => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Tesla", "Pool", "RideRequest", "Fare", "RideStatusHistory", "User", "Zone" RESTART IDENTITY CASCADE;',
  );
  await seedZones();
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

export async function createUser(input: RegisterInput) {
  return authService.register(input);
}

export async function createPassenger(overrides: Partial<RegisterInput> = {}) {
  return createUser({ ...passengerInput, ...overrides });
}

export async function createDriver(overrides: Partial<RegisterInput> = {}) {
  return createUser({ ...driverInput, ...overrides });
}

export function tokenFor(user: { id: number; role: string }): string {
  return signToken({ userId: user.id, role: user.role as RegisterInput['role'] });
}

export const ZONE = {
  pickup: {
    Gulshan: 2,
    Banani: 1,
    Mohakhali: 3,
    Dhanmondi: 4,
    Mirpur: 5,
    Uttara: 6,
    Farmgate: 7,
    Bashundhara: 8,
  },
};
