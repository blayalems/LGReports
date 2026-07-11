import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { FirstRun } from './components/layout/FirstRun';
import { matchRoute, useRouter } from './router/HashRouter';
import AnalyticsPage from './routes/analytics/AnalyticsPage';
import CampaignPage from './routes/campaign/CampaignPage';
import DashboardPage from './routes/dashboard/DashboardPage';
import EventsPage from './routes/events/EventsPage';
import HistoryPage from './routes/history/HistoryPage';
import MembersPage from './routes/members/MembersPage';
import ReportPage from './routes/report/ReportPage';
import SettingsPage from './routes/settings/SettingsPage';
import { useTracker } from './state/StoreContext';

export interface RouteComponentProps {
  /** Trailing path segments after the base route, e.g. ["<weekId>"] for "/report/<weekId>". */
  params: string[];
}

const ROUTE_COMPONENTS: Record<string, (props: RouteComponentProps) => React.ReactElement> = {
  dashboard: () => <DashboardPage />,
  report: (props) => <ReportPage params={props.params} />,
  members: () => <MembersPage />,
  campaign: () => <CampaignPage />,
  events: () => <EventsPage />,
  analytics: () => <AnalyticsPage />,
  history: () => <HistoryPage />,
  settings: () => <SettingsPage />,
};

/** Applies the Settings-chosen theme + accent to the document root so every token-based style follows. */
function useAppliedTheme(theme: 'light' | 'dark' | 'auto' | undefined, accent: string | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') {
      root.dataset.theme = theme;
    } else {
      delete root.dataset.theme; // 'auto' — let prefers-color-scheme decide via tokens.css
    }
    if (accent) {
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--accent-soft', `color-mix(in oklab, ${accent} 14%, transparent)`);
    }
  }, [theme, accent]);
}

function App() {
  const { snapshot, isFirstRun } = useTracker();
  const { path } = useRouter();
  useAppliedTheme(snapshot?.config.theme, snapshot?.config.accent);

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
