import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthContext';
import { Field } from './Field';
import { loginSchema, validate } from './schemas';

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validate(loginSchema, form);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await login(v.data);
      onSuccess();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="auth-form">
      <Field label="Work email" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
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
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="auth-switch">
        New here? <a href="#/signup">Create an account</a>
      </p>
    </form>
  );
}
