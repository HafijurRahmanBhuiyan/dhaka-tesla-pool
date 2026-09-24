import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

async function main() {
  for (const name of dhakaZones) {
    await prisma.zone.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${dhakaZones.length} Dhaka zones.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
