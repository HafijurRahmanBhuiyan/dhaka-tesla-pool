import { z } from 'zod';

const bdPhoneRegex = /^01[3-9]\d{8}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
