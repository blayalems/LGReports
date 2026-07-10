import { useRouter } from '../../router/HashRouter';
import { NAV_ITEMS } from '../../router/navConfig';
import styles from './Sidebar.module.css';

export function Sidebar({ appTitle, networkLabel, church, followUpCount }: { appTitle: string; networkLabel: string; church: string; followUpCount: number }) {
  const { path, navigate } = useRouter();

  return (
    <aside className={styles.aside}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <div className={styles.logo} aria-hidden="true">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 3 7v13h6v-6h6v6h6V7z" />
            </svg>
          </div>
          <div className={styles.brandText}>
            <div className={styles.brandTitle}>{appTitle}</div>
            <div className={styles.brandSub}>{networkLabel}</div>
          </div>
        </div>
        <nav className={styles.nav} aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.navBtn} navbtn`}
              aria-current={path === item.path ? 'page' : undefined}
              onClick={() => navigate(item.path)}
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
                style={{ flex: '0 0 18px' }}
                aria-hidden="true"
              >
                <path d={item.iconPath} />
              </svg>
              <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
              {item.key === 'members' && followUpCount > 0 && (
                <span className={styles.badge} aria-label={`${followUpCount} members need follow-up`}>
                  {followUpCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className={styles.footer}>
          <div className={styles.footerChurch}>{church}</div>
        </div>
      </div>
    </aside>
  );
}
