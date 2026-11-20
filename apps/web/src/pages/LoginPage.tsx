import { AuthLayout, DEMO_MODE, DemoAccess, LoginForm } from '../features/auth';

const toOverview = () => (window.location.hash = '#/overview');

export function LoginPage() {
  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Sign in to your organization's workspace." aside={DEMO_MODE ? <DemoAccess onSignedIn={toOverview} /> : undefined}>
      <LoginForm onSuccess={toOverview} />
    </AuthLayout>
  );
}
