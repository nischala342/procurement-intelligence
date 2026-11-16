import { useEffect, useRef, useState, type PropsWithChildren } from 'react';

export interface NavItem {
  route: string;
  label: string;
}

interface Account {
  email: string;
  organizationName: string;
}

const initials = (a: Account) =>
  (a.organizationName.match(/\b\w/g)?.slice(0, 2).join('') || a.email.slice(0, 2)).toUpperCase();

/** Small popover menu: click-outside and Esc close it; focus returns to the trigger. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function Bell() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="icon-btn bell" aria-label="Notifications" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 01-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="menu" role="region" aria-label="Notifications">
          <p className="menu-title">Notifications</p>
          <p className="muted menu-note">You're all caught up. Alerts for ingestion jobs that need review will appear here once notifications are available.</p>
        </div>
      )}
    </div>
  );
}

function UserMenu({ account, onLogout }: { account: Account; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="avatar" aria-label={`Account menu for ${account.email}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {initials(account)}
      </button>
      {open && (
        <div className="menu menu-right" role="menu">
          <div className="menu-id">
            <strong>{account.organizationName}</strong>
            <span className="muted">{account.email}</span>
          </div>
          <button role="menuitem" className="menu-item danger-text" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

interface ShellProps {
  nav: NavItem[];
  active: string;
  /** When present the shell shows the tenant indicator, bell and account menu. */
  account?: Account | null;
  onLogout?: () => void;
}

export function AppShell({ nav, active, account, onLogout, children }: PropsWithChildren<ShellProps>) {
  return (
    <>
      <header className="topbar">
        <strong className="brand">Procurement Intelligence</strong>
        {account && (
          <nav aria-label="Primary">
            {nav.map((n) => (
              <a key={n.route} href={`#/${n.route}`} aria-current={n.route === active ? 'page' : undefined} className={n.route === active ? 'active' : ''}>
                {n.label}
              </a>
            ))}
          </nav>
        )}
        {account && (
          <div className="topbar-right">
            <span className="tenant" title="Everything you see belongs to this organization only">
              <span aria-hidden="true">●</span> {account.organizationName}
              <span className="sr-only"> (active workspace)</span>
            </span>
            <Bell />
            <UserMenu account={account} onLogout={onLogout ?? (() => undefined)} />
          </div>
        )}
      </header>
      {children}
    </>
  );
}
