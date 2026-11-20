import { useState } from 'react';
import { sampleUrl, useSampleManifest } from '../../shared/lib/samples';
import { useAuth } from './AuthContext';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoAccount } from './demoAccounts';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy-btn"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? '✓' : '⧉'}
    </button>
  );
}

function AccountCard({ a, busy, onSignIn }: { a: DemoAccount; busy: boolean; onSignIn: () => void }) {
  const manifest = useSampleManifest();
  const files = (manifest.data?.files ?? []).filter((f) => f.login === a.email);
  return (
    <li className={`demo-account${a.primary ? ' primary' : ''}`}>
      <div className="demo-account-head">
        <span className={`cc cc-${a.code.toLowerCase()}`} aria-hidden="true">
          {a.code}
        </span>
        <div>
          <strong>{a.organizationName}</strong>
          <span className="demo-meta">
            {a.country} · {a.currency}
            {a.primary && <span className="demo-star"> · Start here</span>}
          </span>
        </div>
      </div>
      <p className="demo-highlight">{a.highlight}</p>
      <dl className="demo-creds">
        <div>
          <dt>Email</dt>
          <dd>
            <code>{a.email}</code>
            <CopyButton text={a.email} label={`email for ${a.organizationName}`} />
          </dd>
        </div>
        <div>
          <dt>Password</dt>
          <dd>
            <code>{DEMO_PASSWORD}</code>
            <CopyButton text={DEMO_PASSWORD} label="password" />
          </dd>
        </div>
      </dl>
      <div className="demo-actions">
        <button type="button" className="btn btn-glow" onClick={onSignIn} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in as this business'}
        </button>
        {files.map((f) => (
          <a key={f.file} className="dl-link" href={sampleUrl(f.file)} download title={f.description}>
            ↓ Q4 2024 {f.format}
            {f.rows ? ` · ${f.rows} lines` : ''}
          </a>
        ))}
      </div>
    </li>
  );
}

/**
 * Judges / reviewers panel: every demo login with its password, one-click sign-in, and the held-back quarter of each
 * business's purchase orders to download and upload in Ingestion (watch the dashboards and recommendations update).
 */
export function DemoAccess({ onSignedIn }: { onSignedIn: () => void }) {
  const { login } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const manifest = useSampleManifest();
  const examples = (manifest.data?.files ?? []).filter((f) => !f.login);

  const signIn = async (a: DemoAccount) => {
    setBusy(a.email);
    setError(null);
    try {
      await login({ email: a.email, password: DEMO_PASSWORD });
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? `${e.message}. Has the database been seeded (npm run db:seed)?` : 'Sign-in failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="demo-access" aria-labelledby="demo-title">
      <h2 id="demo-title">Demo workspaces</h2>
      <p className="demo-intro">
        Five businesses built from a real-shaped dataset of 5,200 purchase-order lines (2022 to Sept 2024), each in its own country and currency. All share the password <code>{DEMO_PASSWORD}</code>.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <ul className="demo-accounts">
        {DEMO_ACCOUNTS.map((a) => (
          <AccountCard key={a.email} a={a} busy={busy === a.email} onSignIn={() => void signIn(a)} />
        ))}
      </ul>
      <div className="demo-try">
        <strong>Try an upload:</strong> download a business&apos;s <em>Q4 2024</em> file above, sign in as that business, open <em>Ingestion → Purchase Orders (ERP)</em> and drop it in. The overview, supplier scorecards and recommendations pick up the new quarter.
      </div>
      {examples.length > 0 && (
        <div className="demo-examples">
          <span>Other formats:</span>
          {examples.map((f) => (
            <a key={f.file} className="dl-link" href={sampleUrl(f.file)} download title={f.description}>
              ↓ {f.title}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
