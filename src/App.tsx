import { AppShell } from './components/layout/AppShell';
import { FirstRun } from './components/layout/FirstRun';
import { matchRoute, useRouter } from './router/HashRouter';
import CampaignPage from './routes/campaign/CampaignPage';
import DashboardPage from './routes/dashboard/DashboardPage';
import MembersPage from './routes/members/MembersPage';
import ReportPage from './routes/report/ReportPage';
import { useTracker } from './state/StoreContext';

// Placeholder while each screen is built out — swapped for the real route
// components (DashboardPage, ReportPage, etc.) once they land.
function ComingSoon({ label }: { label: string }) {
  return (
    <section className="view" style={{ padding: 'clamp(16px,3.5vw,36px)' }}>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>{label}</h1>
      <p style={{ color: 'var(--text2)' }}>This screen is being rebuilt.</p>
    </section>
  );
}

export interface RouteComponentProps {
  /** Trailing path segments after the base route, e.g. ["<weekId>"] for "/report/<weekId>". */
  params: string[];
}

const ROUTE_COMPONENTS: Record<string, (props: RouteComponentProps) => React.ReactElement> = {
  dashboard: () => <DashboardPage />,
  report: (props) => <ReportPage params={props.params} />,
  members: () => <MembersPage />,
  campaign: () => <CampaignPage />,
  events: () => <ComingSoon label="Events & Goals" />,
  analytics: () => <ComingSoon label="Analytics" />,
  history: () => <ComingSoon label="History" />,
  settings: () => <ComingSoon label="Settings" />,
};

function App() {
  const { snapshot, isFirstRun } = useTracker();
  const { path } = useRouter();

  if (!snapshot) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text2)' }}>Loading…</div>;
  }

  if (isFirstRun) {
    return <FirstRun />;
  }

  const matched = matchRoute(path);
  const Route = ROUTE_COMPONENTS[matched?.item.key ?? 'dashboard'] ?? ROUTE_COMPONENTS.dashboard;

  return (
    <AppShell>
      <Route params={matched?.params ?? []} />
    </AppShell>
  );
}

export default App;
