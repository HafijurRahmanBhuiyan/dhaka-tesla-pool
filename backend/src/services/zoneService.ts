import { prisma } from '../utils/prisma';

export const listZones = async (): Promise<Array<{ id: number; name: string }>> => {
  return prisma.zone.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
};
