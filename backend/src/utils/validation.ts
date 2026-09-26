import { z } from 'zod';

const bdPhoneRegex = /^01[3-9]\d{8}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const paymentMethodValues = ['CASH', 'TESLAPAY'] as const;

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must be at most 100 characters'),
    phone: z
      .string()
      .regex(bdPhoneRegex, 'Phone must be a valid Bangladesh number (e.g. 01712345678)'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters'),
    role: z.enum(['PASSENGER', 'DRIVER'], { message: 'Role must be PASSENGER or DRIVER' }),
    tesla: z
      .object({
        plateNickname: z
          .string()
          .trim()
          .min(1, 'plateNickname is required')
          .max(50, 'plateNickname is too long'),
        seatCapacity: z
          .number({ message: 'seatCapacity must be a number' })
          .int('seatCapacity must be a whole number')
          .min(1, 'seatCapacity must be at least 1')
          .max(20, 'seatCapacity must be at most 20'),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'DRIVER') {
      if (!data.tesla) {
        ctx.addIssue({
          code: 'custom',
          path: ['tesla'],
          message: 'tesla details are required when role is DRIVER',
        });
      }
    } else if (data.tesla) {
      ctx.addIssue({
        code: 'custom',
        path: ['tesla'],
        message: 'tesla details are only allowed for DRIVER role',
      });
    }
  });

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Email or phone is required')
    .max(255, 'Identifier is too long')
    .refine(
      (value) => emailRegex.test(value) || bdPhoneRegex.test(value),
      'Identifier must be a valid email or Bangladesh phone number (e.g. 01712345678)',
    ),
  password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const createRideSchema = z
  .object({
    pickupZoneId: z
      .number({ message: 'pickupZoneId must be a number' })
      .int('pickupZoneId must be a whole number')
      .positive('pickupZoneId must be a positive integer'),
    dropoffZoneId: z
      .number({ message: 'dropoffZoneId must be a number' })
      .int('dropoffZoneId must be a whole number')
      .positive('dropoffZoneId must be a positive integer'),
    paymentMethod: z
      .enum(paymentMethodValues, { message: 'paymentMethod must be CASH or TESLAPAY' })
      .optional()
      .default('CASH'),
    driverId: z
      .number({ message: 'driverId must be a number' })
      .int('driverId must be a whole number')
      .positive('driverId must be a positive integer')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.pickupZoneId === data.dropoffZoneId) {
      ctx.addIssue({
        code: 'custom',
        path: ['dropoffZoneId'],
        message: 'dropoffZoneId must differ from pickupZoneId',
      });
    }
  });

export type CreateRideInput = z.infer<typeof createRideSchema>;

export const updateDriverLocationSchema = z.object({
  zoneId: z
    .number({ message: 'zoneId must be a number' })
    .int('zoneId must be a whole number')
    .positive('zoneId must be a positive integer'),
});

export type UpdateDriverLocationInput = z.infer<typeof updateDriverLocationSchema>;

// Body for PATCH /api/driver/status.
export const updateDriverStatusSchema = z.object({
  isActive: z.boolean({ message: 'isActive must be a boolean' }),
});

export type UpdateDriverStatusInput = z.infer<typeof updateDriverStatusSchema>;

const rideStatusValues = [
  'REQUESTED',
  'MATCHED',
  'DRIVER_ARRIVED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
] as const;

// Body for PATCH /api/driver/rides/:rideRequestId/advance. `status` is the
// requested target state; omitted, the single ride advances to the immediate
// next forward step.
export const advanceRideSchema = z.object({
  status: z
    .enum(rideStatusValues, { message: 'status must be a valid pool/ride status' })
    .optional(),
});

export type AdvanceRideInput = z.infer<typeof advanceRideSchema>;

export const fareEstimateQuerySchema = z.object({
  pickupZoneId: z.coerce
    .number({ message: 'pickupZoneId must be a number' })
    .int('pickupZoneId must be a whole number')
    .positive('pickupZoneId must be a positive integer'),
  dropoffZoneId: z.coerce
    .number({ message: 'dropoffZoneId must be a number' })
    .int('dropoffZoneId must be a whole number')
    .positive('dropoffZoneId must be a positive integer'),
});
