import { get, set } from 'idb-keyval'

export interface CachedMedia {
  blob: Blob
  mimeType: string
  cachedAt: number
  fileId: string
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function cacheKey(fileId: string): string {
  return `drive-media-${fileId}`
}

export async function getCachedMedia(fileId: string): Promise<CachedMedia | null> {
  try {
    const entry = await get<CachedMedia>(cacheKey(fileId))
    if (!entry) return null
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null
    return entry
  } catch {
    return null
  }
}

export async function setCachedMedia(fileId: string, blob: Blob, mimeType: string): Promise<void> {
  try {
    const entry: CachedMedia = { blob, mimeType, cachedAt: Date.now(), fileId }
    await set(cacheKey(fileId), entry)
  } catch (err) {
    console.warn('Failed to cache media:', err)
  }
}
