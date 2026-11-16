import { AuthLayout, SignupForm } from '../features/auth';

export function SignupPage() {
  return (
    <AuthLayout title="Create your account" subtitle="Set up a private workspace for your organization's procurement data.">
      <SignupForm onSuccess={() => (window.location.hash = '#/ingestion')} />
    </AuthLayout>
  );
}
