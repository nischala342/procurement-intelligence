import { Pill } from '../../../shared/ui/Pill';
import { SOURCES, type SourceConfig } from '../sources';

interface Props {
  value: SourceConfig;
  onChange: (s: SourceConfig) => void;
}

export function SourceSelector({ value, onChange }: Props) {
  return (
    <div className="source-grid" role="radiogroup" aria-label="Data source">
      {SOURCES.map((s) => {
        const selected = s.key === value.key;
        return (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`source-card ${selected ? 'selected' : ''}`}
            onClick={() => onChange(s)}
          >
            <span className="source-title">
              {selected && <span aria-hidden="true">● </span>}
              {s.title}
            </span>
            <span className="muted source-desc">{s.description}</span>
            <span className="chips">
              {s.accepts.map((a) => (
                <code key={a} className="chip">
                  {a}
                </code>
              ))}
            </span>
            {s.disabledReason && <Pill tone="warn" glyph="⚠">Not enabled yet</Pill>}
          </button>
        );
      })}
    </div>
  );
}
