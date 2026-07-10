import { useState } from 'react';
import { useRouter } from '../../router/HashRouter';
import { MORE_MOBILE_ITEMS, PRIMARY_MOBILE_ITEMS } from '../../router/navConfig';
import { Dialog } from '../ui/Dialog';
import styles from './MobileNav.module.css';

export function MobileNav() {
  const { path, navigate } = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_MOBILE_ITEMS.some((i) => i.path === path);

  return (
    <>
      <nav className={styles.wrap} aria-label="Primary">
        <div className={styles.bar}>
          {PRIMARY_MOBILE_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.btn} navbtn`}
              aria-current={path === item.path ? 'page' : undefined}
              onClick={() => navigate(item.path)}
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={item.iconPath} />
              </svg>
              <span className={styles.label}>{item.shortLabel}</span>
            </button>
          ))}
          <button
            type="button"
            className={`${styles.btn} navbtn`}
            aria-expanded={moreOpen}
            aria-current={moreActive && !moreOpen ? 'page' : undefined}
            onClick={() => setMoreOpen(true)}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
            <span className={styles.label}>More</span>
          </button>
        </div>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="More" variant="sheet">
        <div className={styles.moreList}>
          {MORE_MOBILE_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={styles.moreItem}
              aria-current={path === item.path ? 'page' : undefined}
              onClick={() => {
                navigate(item.path);
                setMoreOpen(false);
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={item.iconPath} />
              </svg>
              {item.label}
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}
