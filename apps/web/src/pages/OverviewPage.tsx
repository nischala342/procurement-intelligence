import { useAuth } from '../features/auth';
import { OverviewDashboard } from '../features/overview';
import '../features/overview/overview.css';

export function OverviewPage() {
  const { user } = useAuth();
  return <OverviewDashboard email={user?.email} organizationName={user?.organizationName} />;
}
