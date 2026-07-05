import { describe, it, expect } from 'vitest';
import { mergeEntries } from './syncMerge';
import { JournalEntry } from '../types';

function makeEntry(overrides: Partial<JournalEntry>): JournalEntry {
  const now = Date.now();
  return {
    id: `entry-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    content: '',
    createdAt: now,
    updatedAt: now,
    tags: [],
    ...overrides,
  };
}

describe('sync merge logic', () => {
  it('merges entries from both sides with no conflicts', () => {
    const local = [makeEntry({ id: '1', title: 'Local only' })];
    const cloud = [makeEntry({ id: '2', title: 'Cloud only' })];
    const merged = mergeEntries(local, cloud);
    expect(merged).toHaveLength(2);
    expect(merged.map(e => e.id)).toEqual(expect.arrayContaining(['1', '2']));
  });

  it('uses cloud version when cloud has newer updatedAt', () => {
    const local = [makeEntry({ id: '1', title: 'Old title', updatedAt: 100 })];
    const cloud = [makeEntry({ id: '1', title: 'New title', updatedAt: 200 })];
    const merged = mergeEntries(local, cloud);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('New title');
  });

  it('keeps local version when local has newer updatedAt', () => {
    const local = [makeEntry({ id: '1', title: 'Newer local', updatedAt: 200 })];
    const cloud = [makeEntry({ id: '1', title: 'Older cloud', updatedAt: 100 })];
    const merged = mergeEntries(local, cloud);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('Newer local');
  });

  it('keeps local version when timestamps are equal', () => {
    const local = [makeEntry({ id: '1', title: 'Local copy', updatedAt: 500 })];
    const cloud = [makeEntry({ id: '1', title: 'Cloud copy', updatedAt: 500 })];
    const merged = mergeEntries(local, cloud);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('Local copy');
  });

  it('falls back to createdAt when updatedAt is 0', () => {
    const local = [makeEntry({ id: '1', title: 'Old local', updatedAt: 0, createdAt: 100 })];
    const cloud = [makeEntry({ id: '1', title: 'New cloud', updatedAt: 0, createdAt: 200 })];
    const merged = mergeEntries(local, cloud);
    expect(merged[0].title).toBe('New cloud');
  });

  it('sorts merged entries by createdAt descending', () => {
    const local = [makeEntry({ id: '1', createdAt: 300 }), makeEntry({ id: '2', createdAt: 100 })];
    const cloud = [makeEntry({ id: '3', createdAt: 200 })];
    const merged = mergeEntries(local, cloud);
    expect(merged.map(e => e.id)).toEqual(['1', '3', '2']);
  });

  it('handles empty local entries', () => {
    const cloud = [makeEntry({ id: '1', title: 'Cloud' })];
    const merged = mergeEntries([], cloud);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('1');
  });

  it('handles empty cloud entries', () => {
    const local = [makeEntry({ id: '1', title: 'Local' })];
    const merged = mergeEntries(local, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('1');
  });

  it('handles both empty', () => {
    const merged = mergeEntries([], []);
    expect(merged).toHaveLength(0);
  });

  it('handles many entries efficiently', () => {
    const local = Array.from({ length: 100 }, (_, i) =>
      makeEntry({ id: `local-${i}`, createdAt: i, updatedAt: i })
    );
    const cloud = Array.from({ length: 100 }, (_, i) =>
      makeEntry({ id: `cloud-${i}`, createdAt: i + 100, updatedAt: i + 100 })
    );
    const merged = mergeEntries(local, cloud);
    expect(merged).toHaveLength(200);
  });

  it('deduplicates entries with same id across local and cloud', () => {
    const local = [makeEntry({ id: 'dup', title: 'v1', updatedAt: 10 })];
    const cloud = [makeEntry({ id: 'dup', title: 'v2', updatedAt: 10 })];
    const merged = mergeEntries(local, cloud);
    expect(merged).toHaveLength(1);
  });

  it('handles entries with missing optional fields', () => {
    const local = [{ id: '1', title: 'Local', content: '', createdAt: 100, updatedAt: 0, tags: [] }];
    const cloud = [{ id: '1', title: 'Cloud', content: '', createdAt: 100, updatedAt: 0, tags: [] }];
    const merged = mergeEntries(local as JournalEntry[], cloud as JournalEntry[]);
    expect(merged).toHaveLength(1);
  });

  it('prefers cloud when both updatedAt are zero and cloud createdAt is newer', () => {
    const local = [makeEntry({ id: '1', title: 'Old', updatedAt: 0, createdAt: 50 })];
    const cloud = [makeEntry({ id: '1', title: 'New', updatedAt: 0, createdAt: 100 })];
    const merged = mergeEntries(local, cloud);
    expect(merged[0].title).toBe('New');
  });
});
