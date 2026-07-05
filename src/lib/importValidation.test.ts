import { describe, it, expect } from 'vitest';

interface JournalEntry {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  mood?: string;
  tags: string[];
  isFavorite?: boolean;
}

function validateAndNormalizeImported(raw: any[]): JournalEntry[] {
  return raw.map((item: any) => ({
    id: item.id || `fallback-${Math.random().toString(36).slice(2, 8)}`,
    title: item.title || '',
    content: item.content || '',
    createdAt: item.createdAt || Date.now(),
    updatedAt: item.updatedAt || Date.now(),
    mood: item.mood,
    tags: Array.isArray(item.tags) ? item.tags : [],
    isFavorite: !!item.isFavorite,
  }));
}

function mergeImported(current: JournalEntry[], imported: JournalEntry[]): JournalEntry[] {
  const existingIds = new Set(current.map(c => c.id));
  const uniqueImported = imported.filter(v => !existingIds.has(v.id));
  return [...uniqueImported, ...current];
}

describe('import validation and merge', () => {
  it('normalizes valid entries', () => {
    const raw = [{ id: '1', title: 'Test', content: 'Hello', createdAt: 1000, updatedAt: 2000 }];
    const result = validateAndNormalizeImported(raw);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
    expect(result[0].title).toBe('Test');
    expect(result[0].tags).toEqual([]);
    expect(result[0].isFavorite).toBe(false);
  });

  it('assigns fallback id when id is missing', () => {
    const raw = [{ title: 'No ID' }];
    const result = validateAndNormalizeImported(raw);
    expect(result[0].id).toMatch(/^fallback-/);
  });

  it('sets defaults for missing fields', () => {
    const raw = [{}];
    const result = validateAndNormalizeImported(raw);
    expect(result[0].title).toBe('');
    expect(result[0].content).toBe('');
    expect(typeof result[0].createdAt).toBe('number');
    expect(typeof result[0].updatedAt).toBe('number');
    expect(result[0].tags).toEqual([]);
    expect(result[0].isFavorite).toBe(false);
  });

  it('coerces tags to array', () => {
    const raw = [{ tags: 'not-an-array' }];
    const result = validateAndNormalizeImported(raw);
    expect(Array.isArray(result[0].tags)).toBe(true);
    expect(result[0].tags).toEqual([]);
  });

  it('coerces isFavorite to boolean', () => {
    const raw1: any[] = [{ isFavorite: 1 }];
    const raw2: any[] = [{ isFavorite: 'yes' }];
    const raw3: any[] = [{ isFavorite: null }];
    expect(validateAndNormalizeImported(raw1)[0].isFavorite).toBe(true);
    expect(validateAndNormalizeImported(raw2)[0].isFavorite).toBe(true);
    expect(validateAndNormalizeImported(raw3)[0].isFavorite).toBe(false);
  });

  it('handles empty input array', () => {
    const result = validateAndNormalizeImported([]);
    expect(result).toEqual([]);
  });

  it('preserves mood field if present', () => {
    const raw = [{ id: '1', mood: 'happy' }];
    const result = validateAndNormalizeImported(raw);
    expect(result[0].mood).toBe('happy');
  });

  it('allows mood to be undefined', () => {
    const raw = [{ id: '1' }];
    const result = validateAndNormalizeImported(raw);
    expect(result[0].mood).toBeUndefined();
  });

  describe('merge with deduplication', () => {
    it('does not duplicate existing ids', () => {
      const current = [{ id: '1', title: 'A', content: '', createdAt: 100, updatedAt: 100, tags: [] }];
      const imported = [{ id: '1', title: 'B', content: '', createdAt: 200, updatedAt: 200, tags: [] }];
      const merged = mergeImported(current, imported);
      expect(merged).toHaveLength(1);
      expect(merged[0].title).toBe('A');
    });

    it('adds new entries from import', () => {
      const current: JournalEntry[] = [];
      const imported = [{ id: '1', title: 'New', content: '', createdAt: 100, updatedAt: 100, tags: [] }];
      const merged = mergeImported(current, imported);
      expect(merged).toHaveLength(1);
    });

    it('prepends imported entries before current', () => {
      const current = [{ id: '1', title: 'Existing', content: '', createdAt: 50, updatedAt: 50, tags: [] }];
      const imported = [{ id: '2', title: 'Imported', content: '', createdAt: 100, updatedAt: 100, tags: [] }];
      const merged = mergeImported(current, imported);
      expect(merged[0].id).toBe('2');
    });

    it('handles all-duplicate import', () => {
      const current = [
        { id: '1', title: 'A', content: '', createdAt: 100, updatedAt: 100, tags: [] },
        { id: '2', title: 'B', content: '', createdAt: 200, updatedAt: 200, tags: [] },
      ];
      const imported = [
        { id: '1', title: 'A1', content: '', createdAt: 100, updatedAt: 100, tags: [] },
        { id: '2', title: 'B1', content: '', createdAt: 200, updatedAt: 200, tags: [] },
      ];
      const merged = mergeImported(current, imported);
      expect(merged).toHaveLength(2);
    });
  });
});
