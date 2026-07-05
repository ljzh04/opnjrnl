import { useEffect } from 'react';

export function useDebouncedSave(
  entry: { id: string } | null,
  title: string,
  content: string,
  onUpdate: (id: string, updates: { title: string; content: string; updatedAt: number }) => void,
  delay = 600,
) {
  useEffect(() => {
    if (!entry) return;
    const timeout = setTimeout(() => {
      onUpdate(entry.id, { title, content, updatedAt: Date.now() });
    }, delay);
    return () => clearTimeout(timeout);
  }, [entry, title, content, onUpdate, delay]);
}
