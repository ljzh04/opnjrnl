import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedMedia {
  blob: Blob;
  mimeType: string;
  cachedAt: number;
  fileId: string;
}

const store = new Map<string, CachedMedia>();

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: CachedMedia) => { store.set(key, value); }),
}));

async function getCachedMedia(fileId: string): Promise<CachedMedia | null> {
  const { get } = await import('idb-keyval');
  const entry = await get<CachedMedia>(`drive-media-${fileId}`);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry;
}

async function setCachedMedia(fileId: string, blob: Blob, mimeType: string): Promise<void> {
  const { set } = await import('idb-keyval');
  const entry: CachedMedia = { blob, mimeType, cachedAt: Date.now(), fileId };
  await set(`drive-media-${fileId}`, entry);
}

describe('driveMedia cache', () => {
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves a media entry', async () => {
    const blob = new Blob(['test-data'], { type: 'image/png' });
    await setCachedMedia('file-123', blob, 'image/png');
    const result = await getCachedMedia('file-123');
    expect(result).not.toBeNull();
    expect(result!.fileId).toBe('file-123');
    expect(result!.mimeType).toBe('image/png');
    expect(result!.blob).toEqual(blob);
  });

  it('returns null for uncached file', async () => {
    const result = await getCachedMedia('nonexistent');
    expect(result).toBeNull();
  });

  it('returns null for expired entries', async () => {
    const blob = new Blob(['expired'], { type: 'text/plain' });
    await setCachedMedia('file-456', blob, 'text/plain');

    vi.advanceTimersByTime(CACHE_TTL_MS + 1);

    const result = await getCachedMedia('file-456');
    expect(result).toBeNull();
  });

  it('returns entry when within TTL', async () => {
    const blob = new Blob(['fresh'], { type: 'text/plain' });
    await setCachedMedia('file-789', blob, 'text/plain');

    vi.advanceTimersByTime(CACHE_TTL_MS - 1);

    const result = await getCachedMedia('file-789');
    expect(result).not.toBeNull();
  });

  it('overwrites existing cache entry for same fileId', async () => {
    const blob1 = new Blob(['v1'], { type: 'text/plain' });
    const blob2 = new Blob(['v2'], { type: 'text/plain' });
    await setCachedMedia('file-overwrite', blob1, 'text/plain');
    await setCachedMedia('file-overwrite', blob2, 'text/plain');

    const result = await getCachedMedia('file-overwrite');
    const text = await result!.blob.text();
    expect(text).toBe('v2');
  });

  it('handles different fileIds independently', async () => {
    const blobA = new Blob(['A'], { type: 'text/plain' });
    const blobB = new Blob(['B'], { type: 'text/plain' });
    await setCachedMedia('file-A', blobA, 'text/plain');
    await setCachedMedia('file-B', blobB, 'text/plain');

    const resultA = await getCachedMedia('file-A');
    const resultB = await getCachedMedia('file-B');
    expect((await resultA!.blob.text())).toBe('A');
    expect((await resultB!.blob.text())).toBe('B');
  });
});
