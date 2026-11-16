import { useState, type FormEvent } from 'react';
import { ApiError } from '../../shared/api';
import { useAuth } from './AuthContext';
import { Field } from './Field';
import { signupSchema, validate } from './schemas';

export function SignupForm({ onSuccess }: { onSuccess: () => void }) {
  const { signup } = useAuth();
  const [form, setForm] = useState({ organizationName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validate(signupSchema, form);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await signup(v.data);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') setErrors({ email: err.message });
      else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        // surface server-side field errors we did not catch client-side
        const fe: Record<string, string> = {};
        for (const d of err.details as Array<{ path: string; message: string }>) if (d.path && !fe[d.path]) fe[d.path] = d.message;
        setErrors(fe);
      } else setFormError(err instanceof Error ? err.message : 'Unable to create account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="auth-form">
      <Field label="Organization name" autoComplete="organization" value={form.organizationName} error={errors.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} />
      <Field label="Work email" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters with a letter and a number."
        value={form.password}
        error={errors.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </button>
      <p className="auth-switch">
        Already have an account? <a href="#/login">Sign in</a>
      </p>
    </form>
  );
}
