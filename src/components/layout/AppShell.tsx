import type { ReactNode } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useTracker } from '../../state/StoreContext';
import { followUpQueue } from '../../domain/selectors';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { LiveRegion } from '../ui/LiveRegion';
import { ToastHost } from '../ui/ToastHost';
import styles from './AppShell.module.css';

export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery('(min-width: 881px)');
  const { snapshot } = useTracker();
  const followUps = snapshot ? followUpQueue(snapshot).length : 0;

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className={styles.mesh} aria-hidden="true">
        <div className={styles.mesh1} />
        <div className={styles.mesh2} />
        <div className={styles.mesh3} />
      </div>
      <div className={styles.layout}>
        {isDesktop && (
          <Sidebar
            appTitle="Life Group Tracker"
            networkLabel={snapshot?.config.network || 'Set up your network'}
            church={snapshot?.config.church || ''}
            followUpCount={followUps}
          />
        )}
        <main id="main-content" tabIndex={-1} className={styles.main}>
          {children}
        </main>
        {!isDesktop && <MobileNav />}
      </div>
      <LiveRegion />
      <ToastHost />
    </>
  );
}
