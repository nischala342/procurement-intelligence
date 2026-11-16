import { formatBytes } from '../../../shared/lib/format';
import { Pill, type Tone } from '../../../shared/ui/Pill';
import { SOURCE_LABEL } from '../sources';
import type { QueueItem, QueueStatus } from '../types';
import type { UploadQueue } from '../hooks/useUploadQueue';

const META: Record<QueueStatus, { tone: Tone; glyph: string; label: string }> = {
  pending: { tone: 'neutral', glyph: '○', label: 'Queued' },
  uploading: { tone: 'info', glyph: '◐', label: 'Uploading' },
  done: { tone: 'ok', glyph: '✓', label: 'Uploaded' },
  duplicate: { tone: 'warn', glyph: '⚠', label: 'Already ingested' },
  failed: { tone: 'bad', glyph: '✕', label: 'Failed' },
};

function Row({ item, queue }: { item: QueueItem; queue: UploadQueue }) {
  const m = META[item.status];
  const label = item.status === 'uploading' && item.progress >= 100 ? 'Processing' : m.label;
  return (
    <li className="queue-row">
      <div className="queue-main">
        <span className="queue-name" title={item.file.name}>
          {item.file.name}
        </span>
        <span className="muted tnum">
          {formatBytes(item.file.size)} · {SOURCE_LABEL[item.sourceType]}
        </span>
      </div>
      <div className="queue-progress">
        <div
          className="bar"
          role="progressbar"
          aria-label={`Upload progress for ${item.file.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={item.progress}
        >
          <span style={{ width: `${item.progress}%` }} />
        </div>
        <span className="tnum muted">{item.progress}%</span>
      </div>
      <Pill tone={m.tone} glyph={m.glyph}>
        {label}
      </Pill>
      <div className="queue-actions">
        {item.status === 'failed' && (
          <button className="btn btn-ghost" onClick={() => queue.retry(item.id)}>
            Retry
          </button>
        )}
        {item.status === 'duplicate' && (
          <button className="btn btn-ghost" onClick={() => queue.processAgain(item.id)}>
            Process again
          </button>
        )}
        {item.status !== 'uploading' && (
          <button className="icon-btn" aria-label={`Remove ${item.file.name} from the list`} onClick={() => queue.remove(item.id)}>
            ✕
          </button>
        )}
      </div>
      {item.error && (
        <p className="queue-error" role="alert">
          {item.error}
        </p>
      )}
    </li>
  );
}

export function UploadQueuePanel({ queue }: { queue: UploadQueue }) {
  const { items } = queue;
  if (!items.length) return null;
  const total = items.reduce((n, i) => n + i.file.size, 0);
  const sent = items.reduce((n, i) => n + (i.file.size * (i.status === 'pending' ? 0 : i.progress)) / 100, 0);
  const pct = total ? Math.round((sent / total) * 100) : 0;
  const finished = items.filter((i) => i.status === 'done').length;

  return (
    <section aria-label="Upload batch" className="queue">
      <div className="queue-head">
        <strong>
          Batch · {finished}/{items.length} uploaded
        </strong>
        <div className="bar bar-wide" role="progressbar" aria-label="Overall batch progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="tnum muted">{pct}%</span>
        <button className="btn btn-ghost" onClick={queue.clearFinished}>
          Clear finished
        </button>
      </div>
      <ul className="queue-list">
        {items.map((i) => (
          <Row key={i.id} item={i} queue={queue} />
        ))}
      </ul>
    </section>
  );
}
