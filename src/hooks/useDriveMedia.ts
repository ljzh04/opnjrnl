import { useCallback, useEffect, useRef, useState } from 'react'
import { getAccessToken } from '../lib/auth'
import { getCachedMedia, setCachedMedia } from '../lib/driveMedia'

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files'

export interface UseDriveMediaResult {
  blobUrl: string | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useDriveMedia(driveFileId: string | null): UseDriveMediaResult {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const activeIdRef = useRef<string | null>(null)

  const revokeBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  const fetchMedia = useCallback(async (fileId: string) => {
    revokeBlobUrl()
    activeIdRef.current = fileId
    setIsLoading(true)
    setError(null)

    try {
      const cached = await getCachedMedia(fileId)
      if (cached) {
        if (activeIdRef.current !== fileId) return
        const url = URL.createObjectURL(cached.blob)
        blobUrlRef.current = url
        setBlobUrl(url)
        setIsLoading(false)
        return
      }

      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch(`${DRIVE_API_BASE}/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`Drive API error: ${response.status}`)

      const blob = await response.blob()
      if (activeIdRef.current !== fileId) return

      setCachedMedia(fileId, blob, blob.type)

      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      setBlobUrl(url)
    } catch (err: any) {
      if (activeIdRef.current === fileId) {
        setError(err.message || 'Failed to load media')
      }
    } finally {
      if (activeIdRef.current === fileId) {
        setIsLoading(false)
      }
    }
  }, [revokeBlobUrl])

  useEffect(() => {
    if (driveFileId) {
      fetchMedia(driveFileId)
    } else {
      revokeBlobUrl()
      setBlobUrl(null)
      setError(null)
      setIsLoading(false)
      activeIdRef.current = null
    }
  }, [driveFileId, fetchMedia, revokeBlobUrl])

  useEffect(() => {
    return () => {
      revokeBlobUrl()
      activeIdRef.current = null
    }
  }, [revokeBlobUrl])

  return {
    blobUrl,
    isLoading,
    error,
    refresh: () => { if (driveFileId) fetchMedia(driveFileId) },
  }
}
