import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 10;

const dhakaZones = [
  'Banani',
  'Gulshan',
  'Mohakhali',
  'Dhanmondi',
  'Mirpur',
  'Uttara',
  'Farmgate',
  'Bashundhara',
];

// PRD story cast. Every fixture shares the documented password (the project has
// no email delivery, so a fixed demo password is intentional).
const DEMO_PASSWORD = 'password123';

interface SeedTesla {
  plateNickname: string;
  seatCapacity: number;
}

interface SeedUser {
  name: string;
  phone: string;
  email: string;
  role: 'PASSENGER' | 'DRIVER';
  tesla?: SeedTesla;
}

const demoUsers: SeedUser[] = [
  {
    name: 'Jashim',
    phone: '01730000001',
    email: 'jashim@example.com',
    role: 'DRIVER',
    tesla: { plateNickname: 'Bullet', seatCapacity: 4 },
  },
  { name: 'Nusrat', phone: '01730000002', email: 'nusrat@example.com', role: 'PASSENGER' },
  { name: 'Rafiq', phone: '01730000003', email: 'rafiq@example.com', role: 'PASSENGER' },
  { name: 'Shirin', phone: '01730000004', email: 'shirin@example.com', role: 'PASSENGER' },
];

async function seedZones(): Promise<void> {
  for (const name of dhakaZones) {
    await prisma.zone.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${dhakaZones.length} Dhaka zones.`);
}

/**
 * Idempotent user seeding: upsert by unique email, only creating what is
 * missing. A driver's Tesla is created only when the driver exists without one,
 * so re-running never duplicates fixtures.
 */
async function seedUser(user: SeedUser): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: user.email },
    include: user.tesla ? { teslas: true } : undefined,
  });

  if (existing) {
    if (user.tesla && existing.teslas.length === 0) {
      await prisma.tesla.create({
        data: { driverId: existing.id, ...user.tesla },
      });
      console.log(`Attached Tesla "${user.tesla.plateNickname}" to ${user.name}.`);
    }
    console.log(`User ${user.name} already exists (id=${existing.id}).`);
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  const created = await prisma.user.create({
    data: { name: user.name, phone: user.phone, email: user.email, passwordHash, role: user.role },
  });
  if (user.tesla) {
    await prisma.tesla.create({
      data: { driverId: created.id, ...user.tesla },
    });
    console.log(`Created driver ${user.name} with Tesla "${user.tesla.plateNickname}".`);
  } else {
    console.log(`Created ${user.role.toLowerCase()} ${user.name}.`);
  }
}

async function main(): Promise<void> {
  await seedZones();
  for (const user of demoUsers) {
    await seedUser(user);
  }
  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
