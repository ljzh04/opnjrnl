import { get, set } from 'idb-keyval';
import { JournalEntry } from '../types';

const DIR_HANDLE_KEY = 'minimal-journal-dir-handle';

export async function getSavedDirectoryHandleInfo(): Promise<{ handle: any, requiresPermission: boolean } | null> {
  try {
    const handle = await get(DIR_HANDLE_KEY);
    if (handle) {
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        return { handle, requiresPermission: false };
      }
      return { handle, requiresPermission: true };
    }
    return null;
  } catch (err) {
    console.error("Failed to get saved directory handle", err);
    return null;
  }
}

export async function requestDirectoryPermission(handle: any): Promise<boolean> {
  try {
    const request = await handle.requestPermission({ mode: 'readwrite' });
    return request === 'granted';
  } catch (e) {
    console.error("Permission request failed", e);
    return false;
  }
}

export async function promptDirectorySelection(): Promise<any | null> {
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    await set(DIR_HANDLE_KEY, handle);
    return handle;
  } catch (err) {
    console.error("Directory selection failed or cancelled", err);
    return null;
  }
}

export async function loadEntriesFromDirectory(dirHandle: any): Promise<JournalEntry[]> {
  const entries: JournalEntry[] = [];
  try {
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.endsWith('.json') && handle.kind === 'file') {
        const file = await handle.getFile();
        const text = await file.text();
        try {
          const entry = JSON.parse(text);
          entries.push(entry);
        } catch (e) {
          console.error(`Failed to parse entry from file ${name}`, e);
        }
      }
    }
  } catch (err) {
    console.error("Failed to load entries from directory", err);
  }
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveEntryToDirectory(dirHandle: any, entry: JournalEntry): Promise<void> {
  try {
    const filename = `${entry.id}.json`;
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(entry, null, 2));
    await writable.close();
  } catch (err) {
    console.error(`Failed to save entry ${entry.id}`, err);
  }
}

export async function deleteEntryFromDirectory(dirHandle: any, id: string): Promise<void> {
  try {
    const filename = `${id}.json`;
    await dirHandle.removeEntry(filename);
  } catch (err) {
    console.error(`Failed to delete entry ${id}`, err);
  }
}

export async function disconnectDirectory(): Promise<void> {
  await set(DIR_HANDLE_KEY, null);
}
