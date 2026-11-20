import { useState } from 'react';
import { sampleUrl, useSampleManifest, type SampleFile } from '../../../shared/lib/samples';
import { SOURCES, type SourceConfig } from '../sources';
import type { SourceType } from '../types';

/**
 * Demo sample uploads: the held-back Q4 2024 purchase orders of the signed-in business (and the other businesses), plus
 * one example per other format. Each can be downloaded, or queued for upload in one click with the right source picked.
 */
export function SampleFiles({ userEmail, onUse }: { userEmail?: string; onUse: (file: File, source: SourceConfig) => void }) {
  const manifest = useSampleManifest();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const files = manifest.data?.files ?? [];
  if (!files.length) return null;

  const mine = files.filter((f) => f.login === userEmail);
  const others = files.filter((f) => !f.login);
  const otherBusinesses = files.filter((f) => f.login && f.login !== userEmail && f.format === 'CSV');

  const use = async (f: SampleFile) => {
    const source = SOURCES.find((s) => s.sourceType === (f.source as SourceType));
    if (!source) return;
    setBusy(f.file);
    setError(null);
    try {
      const r = await fetch(sampleUrl(f.file));
      if (!r.ok) throw new Error(`Download failed (${r.status})`);
      const blob = await r.blob();
      onUse(new File([blob], f.file.split('/').pop()!, { type: blob.type }), source);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the sample');
    } finally {
      setBusy(null);
    }
  };

  const row = (f: SampleFile, highlight = false) => (
    <li key={f.file} className={highlight ? 'mine' : undefined}>
      <div>
        <strong>{f.title}</strong>
        <span className="muted small">
          {f.format}
          {f.rows ? ` · ${f.rows} lines` : ''}
          {f.currency ? ` · ${f.currency}` : ''} · {f.description}
        </span>
      </div>
      <div className="sample-actions">
        <button type="button" className={`btn ${highlight ? 'btn-glow' : 'btn-ghost'}`} disabled={busy === f.file} onClick={() => void use(f)}>
          {busy === f.file ? 'Loading…' : 'Upload this'}
        </button>
        <a className="btn btn-ghost" href={sampleUrl(f.file)} download>
          Download
        </a>
      </div>
    </li>
  );

  return (
    <section className="samples" aria-labelledby="samples-title">
      <h3 id="samples-title">Sample files to try</h3>
      <p className="muted small">
        {mine.length
          ? 'The next quarter (Oct–Dec 2024) of your business was held back from the demo data. Upload it and watch the overview and recommendations update. Uploading the same lines twice is safe: duplicates are ignored.'
          : 'Example exports in every supported format.'}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="sample-list">
        {mine.map((f) => row(f, true))}
        {others.map((f) => row(f))}
      </ul>
      {otherBusinesses.length > 0 && (
        <details className="sample-more">
          <summary>Other demo businesses&apos; Q4 files (upload while signed in as that business)</summary>
          <ul className="sample-list">{otherBusinesses.map((f) => row(f))}</ul>
        </details>
      )}
    </section>
  );
}
