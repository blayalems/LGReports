import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { announce } from '../hooks/useAnnounce';
import { NAV_ITEMS } from './navConfig';

// A deliberately small hash router: "#/report", "#/members", etc. work with no
// server-side rewrite rules, which is what makes this deployable to a GitHub
// Pages *project* site (a path like /LGReports/report would 404 on refresh
// with a history-API router unless you add a 404.html trick; hash routes sidestep it).

function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/';
}

interface RouterContextValue {
  path: string;
  navigate: (path: string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function HashRouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const onHashChange = () => setPath(currentPath());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const item = NAV_ITEMS.find((n) => n.path === path);
    const label = item?.label ?? 'Page';
    document.title = `${label} — Life Group Tracker`;
    announce(`${label} loaded`, 'polite');
    const main = document.getElementById('main-content');
    main?.focus();
  }, [path]);

  const navigate = useCallback((next: string) => {
    if (window.location.hash.replace(/^#/, '') === next) return;
    window.location.hash = next;
  }, []);

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within HashRouterProvider');
  return ctx;
}

export function NavLink({ path, children, ...rest }: { path: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { path: current, navigate } = useRouter();
  return (
    <button type="button" onClick={() => navigate(path)} aria-current={current === path ? 'page' : undefined} {...rest}>
      {children}
    </button>
  );
}
