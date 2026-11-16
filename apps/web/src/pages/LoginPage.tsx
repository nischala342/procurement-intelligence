import { AuthLayout, LoginForm } from '../features/auth';

export function LoginPage() {
  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Sign in to your organization's workspace.">
      <LoginForm onSuccess={() => (window.location.hash = '#/ingestion')} />
    </AuthLayout>
  );
}
