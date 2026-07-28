import { useEffect, useRef } from 'react';

export function useDebouncedSave(
  entry: { id: string } | null,
  title: string,
  content: string,
  onUpdate: (id: string, updates: { title: string; content: string; updatedAt: number }) => void,
  delay = 600,
) {
  const prevRef = useRef({ entryId: entry?.id, title, content });
  // ponytail: track last debounce save to avoid redundant flush
  const lastSavedRef = useRef<{ entryId?: string; title: string; content: string } | null>(null);

  // Debounced save — depends on entry?.id (not entry ref) to avoid infinite re-renders
  useEffect(() => {
    if (!entry) return;
    const timeout = setTimeout(() => {
      onUpdate(entry.id, { title, content, updatedAt: Date.now() });
      lastSavedRef.current = { entryId: entry.id, title, content };
    }, delay);
    return () => clearTimeout(timeout);
  }, [entry?.id, title, content, onUpdate, delay]);

  // ponytail: flush pending save on entry change or unmount, skip if debounce already saved
  useEffect(() => {
    return () => {
      if (prevRef.current.entryId) {
        const prev = prevRef.current;
        const saved = lastSavedRef.current;
        if (saved && saved.entryId === prev.entryId && saved.title === prev.title && saved.content === prev.content) return;
        onUpdate(prev.entryId, { title: prev.title, content: prev.content, updatedAt: Date.now() });
      }
    };
  }, [entry?.id]);

  // Capture previous values for cleanup (runs after effect cleanups)
  useEffect(() => {
    prevRef.current = { entryId: entry?.id, title, content };
  });
}
