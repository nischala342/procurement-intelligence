/** Shared toJSON transform: `_id` -> `id`, drops internal arrays callers don't need. */
export const jsonOptions = (hide: string[] = []) => ({
  transform: (_doc: unknown, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    for (const k of hide) delete ret[k];
    return ret;
  },
});
