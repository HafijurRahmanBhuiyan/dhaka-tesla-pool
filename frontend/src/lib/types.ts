export type Role = "PASSENGER" | "DRIVER";

export type RideStatus =
  | "REQUESTED"
  | "MATCHED"
  | "DRIVER_ARRIVED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELLED";

export type PaymentMethod = "CASH" | "TESLAPAY";

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
  role: Role;
  createdAt: string;
  locationZone?: Zone | null;
  teslas?: TeslaSummary[];
}

export interface Zone {
  id: number;
  name: string;
}

export interface AvailableDriver {
  id: number;
  name: string;
  phone: string;
  location: Zone;
  tesla: {
    id: number;
    plateNickname: string;
    seatCapacity: number;
  };
  seatsUsed: number;
  availableSeats: number;
  isAvailable: boolean;
}

export interface TeslaBrief {
  id: number;
  plateNickname: string;
  seatCapacity: number;
  driverId: number;
}

export interface Fare {
  id: number;
  rideRequestId: number;
  paymentMethod: PaymentMethod;
  baseFarePoysha: number;
  distanceChargePoysha: number;
  poolDiscountPoysha: number;
  totalFarePoysha: number;
  settled: boolean;
  paidAt: string | null;
}

export interface StatusHistoryEntry {
  id: number;
  fromStatus: RideStatus;
  toStatus: RideStatus;
  changedAt: string;
  actor: string;
}

export interface PoolSummary {
  id: number;
  status: RideStatus;
  seatsUsed: number;
  tesla?: TeslaBrief | null;
}

export interface RideRequest {
  id: number;
  passengerId: number;
  pickupZoneId: number;
  dropoffZoneId: number;
  status: RideStatus;
  requestedAt: string;
  pickupZone: Zone;
  dropoffZone: Zone;
  pool: PoolSummary | null;
  fare: Fare | null;
  statusHistory: StatusHistoryEntry[];
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface DriverPoolPassenger {
  id: number;
  name: string;
  phone: string;
}

export interface DriverPoolRide {
  id: number;
  status: RideStatus;
  passenger: DriverPoolPassenger;
  pickupZone: Zone;
  dropoffZone: Zone;
  fare: Fare | null;
}

export interface DriverPool {
  id: number;
  status: RideStatus;
  seatsUsed: number;
  tesla: { id: number; plateNickname: string; seatCapacity: number };
  rideRequests: DriverPoolRide[];
}

export interface ActivePoolsResponse {
  pools: DriverPool[];
}

export interface DriverStatus {
  teslaId: number;
  isActive: boolean;
  lastActiveAt: string | null;
  seatCapacity: number;
  seatsUsed: number;
}

export interface DriverStatusResponse {
  status: DriverStatus;
}

export interface ZodIssue {
  field: string;
  message: string;
}

export interface ErrorBody {
  error: string;
  issues?: ZodIssue[];
}