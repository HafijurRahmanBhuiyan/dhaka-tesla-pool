import { type Prisma, type PrismaClient, type RideStatus } from '@prisma/client';

type DbClient = Prisma.TransactionClient | PrismaClient;

export interface PoolState {
  status: RideStatus;
  seatsUsed: number;
}

/**
 * Derives the pool-level OPEN/CLOSED state from its member ride requests:
 *
 *   - OPEN   ('MATCHED') while at least one member is still active (non-
 *             terminal). A started or completed trip does not gate this: new
 *             passengers can still join mid-trip while capacity allows.
 *   - CLOSED ('COMPLETED') when every member is terminal and at least one
 *             completed.
 *   - CANCELLED when every member was cancelled (no ride ever completed).
 *
 * `seatsUsed` tracks the number of ACTIVE members, so a completed rider's seat
 * frees up for a mid-trip join. The pool transition is derived from the member
 * rides, never set independently, and is left untouched on the returned row
 * once a pool is terminal.
 */
export async function recomputePoolState(tx: DbClient, poolId: number): Promise<PoolState> {
  const members = await tx.rideRequest.findMany({
    where: { poolId },
    select: { status: true },
  });

  const activeMembers = members.filter((m) => m.status !== 'COMPLETED' && m.status !== 'CANCELLED');
  const anyCompleted = members.some((m) => m.status === 'COMPLETED');

  const state: PoolState = {
    status: activeMembers.length > 0 ? 'MATCHED' : anyCompleted ? 'COMPLETED' : 'CANCELLED',
    seatsUsed: activeMembers.length,
  };

  const pool = await tx.pool.findUnique({
    where: { id: poolId },
    select: { startedAt: true, completedAt: true },
  });

  const update: Prisma.PoolUpdateArgs['data'] = {
    status: state.status,
    seatsUsed: state.seatsUsed,
  };

  const anyStarted = members.some((m) => m.status === 'STARTED' || m.status === 'COMPLETED');
  if (anyStarted && pool?.startedAt === null) update.startedAt = new Date();
  if (state.status === 'COMPLETED' && pool?.completedAt === null) update.completedAt = new Date();

  await tx.pool.update({ where: { id: poolId }, data: update });

  return state;
}
