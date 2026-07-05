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

function fuzzyMatch(content: string, query: string): boolean {
  if (!query) return true;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const target = content.toLowerCase();
  return words.every(word => target.includes(word));
}

function filterEntries(
  entries: JournalEntry[],
  searchQuery: string,
  selectedTag: string | null,
  showFavoritesOnly: boolean,
): JournalEntry[] {
  return entries.filter(entry => {
    const combinedContent = `${entry.title} ${entry.content}`;
    const matchesSearch = fuzzyMatch(combinedContent, searchQuery);
    const matchesTag = !selectedTag || entry.tags.includes(selectedTag);
    const matchesFav = !showFavoritesOnly || entry.isFavorite;
    return matchesSearch && matchesTag && matchesFav;
  });
}

function makeEntry(overrides: Partial<JournalEntry>): JournalEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    content: '',
    createdAt: 1000,
    updatedAt: 1000,
    tags: [],
    ...overrides,
  };
}

function stripHtml(str: string): string {
  if (!str) return 'Start taking records...';
  return str.replace(/<[^>]*>?/gm, '').trim();
}

describe('stripHtml', () => {
  it('returns default text for empty string', () => {
    expect(stripHtml('')).toBe('Start taking records...');
  });

  it('returns default text for null/undefined', () => {
    expect(stripHtml(null as any)).toBe('Start taking records...');
  });

  it('strips HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
  });

  it('strips nested HTML tags', () => {
    expect(stripHtml('<div><p>Deep <b>content</b></p></div>')).toBe('Deep content');
  });

  it('trims whitespace after stripping', () => {
    expect(stripHtml('  <p>spaced</p>  ')).toBe('spaced');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtml('Just some text')).toBe('Just some text');
  });
});

describe('fuzzyMatch', () => {
  it('returns true for empty query', () => {
    expect(fuzzyMatch('anything', '')).toBe(true);
  });

  it('matches single word in content', () => {
    expect(fuzzyMatch('hello world', 'hello')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(fuzzyMatch('HELLO WORLD', 'hello')).toBe(true);
    expect(fuzzyMatch('hello world', 'HELLO')).toBe(true);
  });

  it('matches all words in any order', () => {
    expect(fuzzyMatch('the quick brown fox', 'quick fox')).toBe(true);
  });

  it('fails if any word is missing', () => {
    expect(fuzzyMatch('the quick brown fox', 'quick cat')).toBe(false);
  });

  it('handles multiple spaces in query', () => {
    expect(fuzzyMatch('hello world', '  hello   world  ')).toBe(true);
  });

  it('handles empty content gracefully', () => {
    expect(fuzzyMatch('', 'hello')).toBe(false);
  });

  it('handles special regex characters safely (no regex injection)', () => {
    expect(fuzzyMatch('foo (bar) [baz]', '(bar)')).toBe(true);
    expect(fuzzyMatch('foo (bar) [baz]', '[baz]')).toBe(true);
  });

  it('matches partial words', () => {
    expect(fuzzyMatch('journal entry', 'jour')).toBe(true);
  });
});

describe('entry filtering', () => {
  const entries = [
    makeEntry({ id: '1', title: 'Morning pages', content: 'Woke up late today', tags: ['daily'], isFavorite: true }),
    makeEntry({ id: '2', title: 'Grocery list', content: 'Milk, eggs, bread', tags: ['todo'] }),
    makeEntry({ id: '3', title: 'Book notes', content: 'Chapter 3 was interesting', tags: ['reading'], isFavorite: true }),
    makeEntry({ id: '4', title: 'Untitled', content: 'Random thought', tags: [] }),
  ];

  it('returns all entries with no filters', () => {
    const result = filterEntries(entries, '', null, false);
    expect(result).toHaveLength(4);
  });

  it('filters by search query', () => {
    const result = filterEntries(entries, 'morning', null, false);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by tag', () => {
    const result = filterEntries(entries, '', 'todo', false);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('filters by favorites only', () => {
    const result = filterEntries(entries, '', null, true);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.id)).toEqual(expect.arrayContaining(['1', '3']));
  });

  it('combines search, tag, and favorites filter', () => {
    const result = filterEntries(entries, 'chapter', 'reading', true);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('returns empty when no entries match all filters', () => {
    const result = filterEntries(entries, 'nonexistent', null, false);
    expect(result).toHaveLength(0);
  });

  it('returns empty when tag does not exist', () => {
    const result = filterEntries(entries, '', 'nonexistent', false);
    expect(result).toHaveLength(0);
  });

  it('searches across title and content', () => {
    const result = filterEntries(entries, 'eggs', null, false);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('handles empty entries array', () => {
    const result = filterEntries([], '', null, false);
    expect(result).toHaveLength(0);
  });

  it('handles entries with missing tags gracefully', () => {
    const noTags = [makeEntry({ id: '5', title: 'No tags' })];
    delete (noTags[0] as any).tags;
    const result = filterEntries(noTags, '', null, false);
    expect(result).toHaveLength(1);
  });

  it('favorites filter works when isFavorite is undefined', () => {
    const undef = [makeEntry({ id: '6', title: 'Undefined fav' })];
    undef[0].isFavorite = undefined;
    const resultFalse = filterEntries(undef, '', null, true);
    expect(resultFalse).toHaveLength(0);
  });
});
