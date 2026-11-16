import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const signupBody = z.object({
  email,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number')
    // bcrypt only uses the first 72 bytes; reject rather than silently truncate
    .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes'),
  organizationName: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(120),
});

export const loginBody = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});

export type SignupInput = z.infer<typeof signupBody>;
export type LoginInput = z.infer<typeof loginBody>;
