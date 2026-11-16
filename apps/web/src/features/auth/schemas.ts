import { z } from 'zod';

// Mirrors the API rules (apps/api/src/modules/auth/schema.ts) so users get instant feedback.
const email = z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email address'));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z.object({
  organizationName: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(120),
  email,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number')
    .refine((p) => new TextEncoder().encode(p).length <= 72, 'Password must be at most 72 bytes'),
});

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Runs a schema and returns the first message per field, or the parsed data. */
export function validate<S extends z.ZodType>(schema: S, input: unknown): { ok: true; data: z.infer<S> } | { ok: false; errors: Record<string, string> } {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const errors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
