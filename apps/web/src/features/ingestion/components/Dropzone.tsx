import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { formatBytes } from '../../../shared/lib/format';
import { MAX_UPLOAD_BYTES, type SourceConfig } from '../sources';

interface Props {
  source: SourceConfig;
  onFiles: (files: File[]) => void;
}

export function Dropzone({ source, onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const hintId = useId();
  const disabled = Boolean(source.disabledReason);

  const take = (list: FileList | null) => list && list.length && onFiles([...list]);
  const open = () => !disabled && input.current?.click();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) take(e.dataTransfer.files);
  };

  return (
    <div
      className={`dropzone ${over ? 'over' : ''} ${disabled ? 'disabled' : ''}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={`Upload files for ${source.title}. Drag and drop or press Enter to browse.`}
      aria-describedby={hintId}
      onClick={open}
      onKeyDown={onKey}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={source.accepts.join(',')}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
      <span className="dz-icon" aria-hidden="true">
        ⬆
      </span>
      <strong>{disabled ? 'Uploads unavailable for this source' : 'Drop files here, or click to browse'}</strong>
      <span id={hintId} className="muted">
        {disabled ? source.disabledReason : `${source.accepts.join(', ')} · up to ${formatBytes(MAX_UPLOAD_BYTES)} each · multiple files allowed`}
      </span>
    </div>
  );
}
