import { prisma } from '../../src/utils/prisma';

afterAll(async () => {
  await prisma.$disconnect();
});
