import { currencyCode } from '../../../shared/lib/format';
import { useState } from 'react';
import { Card } from '../../../shared/ui/Card';
import { useIngestion } from '../hooks/IngestionContext';
import { SOURCES, type SourceConfig } from '../sources';
import { Dropzone } from './Dropzone';
import { MarketSources } from './MarketSources';
import { SampleFiles } from './SampleFiles';
import { SourceSelector } from './SourceSelector';
import { UploadQueuePanel } from './UploadQueuePanel';

/** Multi-source ingestion hub: pick a source, drop files, watch the batch upload. */
export function IngestionHub({ userEmail }: { userEmail?: string } = {}) {
  const { queue } = useIngestion();
  const [source, setSource] = useState<SourceConfig>(SOURCES[0]!);
  const [rejections, setRejections] = useState<string[]>([]);

  return (
    <Card title="Ingestion Hub">
      <SourceSelector value={source} onChange={(s) => (setSource(s), setRejections([]))} />

      <div className="hub-options">
        <label className="check">
          <input
            type="checkbox"
            checked={queue.options.dayFirst}
            onChange={(e) => queue.setOptions({ ...queue.options, dayFirst: e.target.checked })}
          />
          Read ambiguous dates as day/month (03/04/2025 = 3 April)
        </label>
        <label className="inline">
          Default currency
          <input
            value={queue.options.defaultCurrency}
            maxLength={3}
            placeholder={currencyCode()}
            aria-label="Default currency (ISO code)"
            onChange={(e) => queue.setOptions({ ...queue.options, defaultCurrency: e.target.value.toUpperCase() })}
          />
        </label>
        {source.key === 'shopify' && (
          <button className="btn btn-ghost" disabled title="Store API connection is not available yet. Upload an export instead.">
            Connect store (coming soon)
          </button>
        )}
      </div>

      <Dropzone source={source} onFiles={(files) => setRejections(queue.addFiles(files, source.sourceType))} />

      {rejections.length > 0 && (
        <ul className="rejections" role="alert" aria-label="Files that were not added">
          {rejections.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {source.unsupported && !source.disabledReason && (
        <p className="muted note">
          {source.unsupported.join(', ')} {source.unsupported.length > 1 ? 'are' : 'is'} not supported for this source yet.
        </p>
      )}

      <SampleFiles
        userEmail={userEmail}
        onUse={(file, s) => {
          setSource(s);
          setRejections(queue.addFiles([file], s.sourceType));
        }}
      />

      <MarketSources />

      <UploadQueuePanel queue={queue} />
    </Card>
  );
}
