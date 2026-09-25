import type { RideStatus } from '@prisma/client';

/**
 * Explicit valid-transitions map applied to each RideRequest's own lifecycle.
 * A transition is only legal when the target status is listed for the current
 * status. Cancellation is valid from any non-terminal state; COMPLETED and
 * CANCELLED are terminal. Pool.status is no longer driven by this map: it is a
 * coarse derived OPEN/CLOSED flag (see services/poolStateService.ts).
 */
export const POOL_STATUS_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  REQUESTED: ['MATCHED', 'CANCELLED'],
  MATCHED: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED'],
  STARTED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** The immediate next step in the forward lifecycle for statuses without an explicit target. */
export const NEXT_FORWARD_STEP: Record<RideStatus, RideStatus | null> = {
  REQUESTED: 'MATCHED',
  MATCHED: 'DRIVER_ARRIVED',
  DRIVER_ARRIVED: 'STARTED',
  STARTED: 'COMPLETED',
  COMPLETED: null,
  CANCELLED: null,
};
