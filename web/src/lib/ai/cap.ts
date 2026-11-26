/**
 * A per-key daily call limit for paid AI features. In memory, so it is per server instance: it caps cost
 * in practice but is not a hard guarantee across many instances.
 */
export function makeDailyCap(limit: number): (key: string, now?: Date) => boolean {
  const counts = new Map<string, { day: string; n: number }>();
  return (key, now = new Date()) => {
    const day = now.toISOString().slice(0, 10);
    const cur = counts.get(key);
    if (!cur || cur.day !== day) {
      counts.set(key, { day, n: 1 });
      return limit > 0;
    }
    if (cur.n >= limit) return false;
    cur.n++;
    return true;
  };
}
