import { JournalEntry } from '../types';

export function mergeEntries(
  local: JournalEntry[],
  cloud: JournalEntry[],
): JournalEntry[] {
  const map = new Map<string, JournalEntry>();
  local.forEach(e => map.set(e.id, e));
  cloud.forEach(e => {
    const existing = map.get(e.id);
    if (!existing) {
      map.set(e.id, e);
    } else {
      const existingTime = existing.updatedAt || existing.createdAt || 0;
      const cloudTime = e.updatedAt || e.createdAt || 0;
      if (cloudTime > existingTime) {
        map.set(e.id, e);
      }
    }
  });
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}
