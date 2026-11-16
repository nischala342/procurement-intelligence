import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api';
import { formatBytes } from '../../../shared/lib/format';
import { uploadFile } from '../api';
import { MAX_UPLOAD_BYTES, extOf, sourceBySourceType } from '../sources';
import type { QueueItem, SourceType, UploadOptions } from '../types';

const CONCURRENCY = 2;
let seq = 0;

export interface UploadQueue {
  items: QueueItem[];
  options: UploadOptions;
  setOptions: (o: UploadOptions) => void;
  /** Validates and enqueues files; returns human-readable rejection messages. Uploads start automatically. */
  addFiles: (files: File[], sourceType: SourceType) => string[];
  retry: (id: string) => void;
  processAgain: (id: string) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
  findByJobId: (jobId: string) => QueueItem | undefined;
}

export function useUploadQueue(onSettled: () => void): UploadQueue {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [options, setOptions] = useState<UploadOptions>({ dayFirst: true, defaultCurrency: '' });
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const running = useRef(0);
  const started = useRef(new Set<string>());

  const patch = useCallback((id: string, p: Partial<QueueItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i))), []);

  const execute = useCallback(
    async (item: QueueItem) => {
      patch(item.id, { status: 'uploading', progress: 0, error: undefined });
      try {
        const res = await uploadFile(item.file, item.sourceType, { ...optionsRef.current, allowDuplicate: item.allowDuplicate }, (pct) =>
          patch(item.id, { progress: pct }),
        );
        patch(item.id, { status: 'done', progress: 100, jobId: res.data.id });
      } catch (e) {
        const jobId = e instanceof ApiError ? (e.details as { jobId?: string } | undefined)?.jobId : undefined;
        if (e instanceof ApiError && e.code === 'DUPLICATE_FILE') patch(item.id, { status: 'duplicate', error: e.message, jobId });
        else patch(item.id, { status: 'failed', error: e instanceof Error ? e.message : 'Upload failed', jobId });
      } finally {
        running.current -= 1;
        settledRef.current();
      }
    },
    [patch],
  );

  // Pump: start pending items while under the concurrency limit.
  useEffect(() => {
    for (const item of items) {
      if (running.current >= CONCURRENCY) break;
      const key = `${item.id}:${item.attempt}`;
      if (item.status !== 'pending' || started.current.has(key)) continue;
      started.current.add(key);
      running.current += 1;
      void execute(item);
    }
  }, [items, execute]);

  const addFiles = useCallback((files: File[], sourceType: SourceType) => {
    const cfg = sourceBySourceType(sourceType);
    const rejected: string[] = [];
    const accepted: QueueItem[] = [];
    for (const file of files) {
      const ext = extOf(file.name);
      if (!cfg.accepts.includes(ext)) {
        const hint = cfg.unsupported?.includes(ext) ? ` ${ext} is not supported yet.` : '';
        rejected.push(`${file.name}: ${cfg.title} accepts ${cfg.accepts.join(', ')}.${hint}`);
      } else if (file.size === 0) rejected.push(`${file.name}: file is empty.`);
      else if (file.size > MAX_UPLOAD_BYTES) rejected.push(`${file.name}: ${formatBytes(file.size)} exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`);
      else if (itemsRef.current.some((i) => i.file.name === file.name && i.file.size === file.size && i.sourceType === sourceType && i.status !== 'failed'))
        rejected.push(`${file.name}: already in the queue.`);
      else accepted.push({ id: `q${++seq}`, file, sourceType, status: 'pending', progress: 0, attempt: 1, allowDuplicate: false });
    }
    if (accepted.length) setItems((prev) => [...accepted, ...prev]);
    return rejected;
  }, []);

  const requeue = useCallback((id: string, allowDuplicate: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'pending', progress: 0, error: undefined, attempt: i.attempt + 1, allowDuplicate } : i)));
  }, []);

  return {
    items,
    options,
    setOptions,
    addFiles,
    retry: (id) => requeue(id, false),
    processAgain: (id) => requeue(id, true),
    remove: (id) => setItems((prev) => prev.filter((i) => i.id !== id)),
    clearFinished: () => setItems((prev) => prev.filter((i) => i.status === 'pending' || i.status === 'uploading')),
    findByJobId: (jobId) => itemsRef.current.find((i) => i.jobId === jobId),
  };
}
