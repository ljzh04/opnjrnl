/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, ChangeEvent, useRef } from 'react';
import { JournalEntry, MinimalThemeId } from './types';
import { MINIMAL_THEMES } from './themeData';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { initAuth, googleSignIn, getAccessToken } from './lib/auth';

const ENTRIES_STORAGE_KEY = 'minimal-journal-entries';
const THEME_STORAGE_KEY = 'minimal-journal-theme';
const DRIVE_FILE_ID_KEY = 'minimal-journal-drive-file-id';

export default function App() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [themeId, setThemeId] = useState<MinimalThemeId>('paper');
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [deletedEntryState, setDeletedEntryState] = useState<{ entry: JournalEntry } | null>(null);

  // Cloud Sync properties
  const [driveConnected, setDriveConnected] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearUndoState = () => {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setDeletedEntryState(null);
  };

  // Initial persistent state restoration
  useEffect(() => {
    Promise.all([
      get<JournalEntry[]>(ENTRIES_STORAGE_KEY),
      get<MinimalThemeId>(THEME_STORAGE_KEY)
    ]).then(([storedEntries, storedThemeId]) => {
      if (storedEntries) {
        // Ensure all historical entries have a tags array to avoid runtime crashes
        const polished = storedEntries.map(entry => ({
          ...entry,
          tags: entry.tags || []
        }));
        setEntries(polished);
      }
      if (storedThemeId && MINIMAL_THEMES[storedThemeId]) {
        setThemeId(storedThemeId);
      }
      setIsLoaded(true);
    }).catch((err) => {
      console.error("IndexedDB load error:", err);
      setIsLoaded(true); // Proceed anyway with default values
    });

    // Initialize Auth
    initAuth(
      (_user, _token) => setDriveConnected(true),
      () => setDriveConnected(false)
    );
  }, []);

  const handleConnectDrive = async () => {
    try {
      const res = await googleSignIn();
      if (res?.accessToken) {
        setDriveConnected(true);
        // Trigger a sync immediately
        await syncToDrive(entries, res.accessToken);
      }
    } catch (err) {
      console.error("Could not sign in:", err);
      alert("Failed to connect to Google Drive");
    }
  };

  const syncToDrive = async (dataToSync: JournalEntry[], token?: string | null) => {
    const accessToken = token || await getAccessToken();
    if (!accessToken) return;

    try {
      const fileId = await get<string>(DRIVE_FILE_ID_KEY);
      const dataStr = JSON.stringify(dataToSync);
      const mimeType = 'application/json';

      if (fileId) {
        // Update existing file
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': mimeType
          },
          body: dataStr
        });
      } else {
        // Create new file
        const metadata = {
          name: 'minimal_journal_backup.json',
          mimeType,
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([dataStr], { type: mimeType }));

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: form
        });

        const createdFile = await res.json();
        if (createdFile.id) {
          await set(DRIVE_FILE_ID_KEY, createdFile.id);
        }
      }
    } catch (err) {
      console.error("Drive sync error:", err);
    }
  };

  // Sync entries to storage
  useEffect(() => {
    if (isLoaded) {
      set(ENTRIES_STORAGE_KEY, entries).catch(console.error);

      // Debounced Drive Sync
      if (driveConnected) {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => {
          syncToDrive(entries);
        }, 10000); // Wait 10s of quiet time before uploading a backup
      }
    }
  }, [entries, isLoaded, driveConnected]);


  // Sync theme to storage
  useEffect(() => {
    if (isLoaded) {
      set(THEME_STORAGE_KEY, themeId).catch(console.error);
    }
  }, [themeId, isLoaded]);

  const handleSelectTheme = (id: string) => {
    if (MINIMAL_THEMES[id]) {
      setThemeId(id as MinimalThemeId);
    }
  };

  const handleNewEntry = () => {
    clearUndoState();
    const newEntry: JournalEntry = {
      id: uuidv4(),
      title: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
    };
    setEntries([newEntry, ...entries]);
    setActiveEntryId(newEntry.id);
  };

  const handleUpdateEntry = (id: string, updates: Partial<JournalEntry>) => {
    setEntries(current =>
      current.map(entry =>
        entry.id === id ? { ...entry, ...updates } : entry
      )
    );
  };

  const handleDeleteEntry = (id: string) => {
    const entryToDelete = entries.find(e => e.id === id);
    if (entryToDelete) {
      setDeletedEntryState({ entry: entryToDelete });
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = setTimeout(() => {
        setDeletedEntryState(null);
      }, 10000); // UI lasts for 10 seconds
    }

    setEntries(current => current.filter(entry => entry.id !== id));
    if (activeEntryId === id) {
      setActiveEntryId(null);
    }
  };

  const handleUndoDelete = () => {
    if (deletedEntryState) {
      setEntries(current => [deletedEntryState.entry, ...current].sort((a, b) => b.createdAt - a.createdAt));
      setActiveEntryId(deletedEntryState.entry.id);
      clearUndoState();
    }
  };

  // Export JSON file
  const handleExportData = () => {
    try {
      const dataStr = JSON.stringify(entries, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `journal-archive-${new Date().toISOString().slice(0, 10)}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } catch (e) {
      alert("Export failed: " + e);
    }
  };

  // Import JSON file
  const handleImportData = (e: ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target?.result as string);
          if (Array.isArray(imported)) {
            // Validate basic schema for items
            const verified: JournalEntry[] = imported.map((item: any) => {
              return {
                id: item.id || uuidv4(),
                title: item.title || '',
                content: item.content || '',
                createdAt: item.createdAt || Date.now(),
                updatedAt: item.updatedAt || Date.now(),
                mood: item.mood,
                tags: Array.isArray(item.tags) ? item.tags : [],
                isFavorite: !!item.isFavorite
              };
            });

            // Merge with existing entries (avoid duplicates by ID)
            setEntries(current => {
              const existingIds = new Set(current.map(c => c.id));
              const uniqueImported = verified.filter(v => !existingIds.has(v.id));
              return [...uniqueImported, ...current];
            });

            alert(`Successfully restored ${verified.length} pages to database!`);
          } else {
            alert("Format invalid. Backup must be a valid JSON array.");
          }
        } catch (err) {
          alert("Failed to parse backup file: " + err);
        }
      };
    }
  };

  const currentTheme = MINIMAL_THEMES[themeId] || MINIMAL_THEMES.paper;
  const activeEntry = entries.find(e => e.id === activeEntryId) || null;

  if (!isLoaded) {
    return (
      <div className="h-[100dvh] w-full bg-zinc-50 flex flex-col gap-3 items-center justify-center font-sans text-xs tracking-wider text-zinc-400 select-none">
        <RefreshCw className="w-5 h-5 text-zinc-300 animate-spin" />
        <span>Restoring database...</span>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col md:flex-row h-[100dvh] w-full text-zinc-900 overflow-hidden font-sans sm:select-auto select-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] transition-all duration-300"
      style={{ backgroundColor: currentTheme.background, color: currentTheme.textPrimary }}
    >
      {/* Sidebar container */}
      <div 
        className={`transition-all duration-300 ease-in-out shrink-0 h-full ${
          activeEntryId ? 'hidden md:flex md:w-[350px] lg:w-[390px]' : 'flex w-full md:w-[350px] lg:w-[390px]'
        }`}
      >
        <Sidebar
          entries={entries}
          activeEntryId={activeEntryId}
          onSelectEntry={(id) => {
            clearUndoState();
            setActiveEntryId(id);
          }}
          onNewEntry={handleNewEntry}
          onDeleteEntry={handleDeleteEntry}
          theme={currentTheme}
          currentThemeId={themeId}
          onSelectTheme={handleSelectTheme}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
          showFavoritesOnly={showFavoritesOnly}
          onToggleFavorites={() => setShowFavoritesOnly(!showFavoritesOnly)}
          onExport={handleExportData}
          onImport={handleImportData}
          onConnectDrive={handleConnectDrive}
          driveConnected={driveConnected}
        />
      </div>

      {/* Editor container */}
      <div 
        className={`flex-1 flex flex-col min-w-0 transition-colors duration-300 ${!activeEntryId ? 'hidden md:flex' : 'flex'}`}
        style={{ backgroundColor: currentTheme.surface }}
      >
        {/* Mobile secondary tool header */}
        {activeEntryId && (
          <div 
            className="md:hidden px-6 py-4 flex items-center justify-between sticky top-0 z-10 transition-colors duration-300"
            style={{ 
              borderBottom: `1px solid ${currentTheme.surfaceBorder}`,
              backgroundColor: currentTheme.surface,
              color: currentTheme.textPrimary
            }}
          >
            <button
              onClick={() => setActiveEntryId(null)}
              className="flex items-center text-xs font-medium tracking-wide transition-all uppercase cursor-pointer"
              style={{ color: currentTheme.accent }}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              <span>Timeline</span>
            </button>
            <span className="text-[10px] tracking-[0.2em] uppercase font-semibold opacity-40 select-none">
              Composition
            </span>
            <div className="w-12 shrink-0" /> {/* Spacer */}
          </div>
        )}
        <Editor
          entry={activeEntry}
          onUpdate={handleUpdateEntry}
          onDelete={handleDeleteEntry}
          theme={currentTheme}
          entries={entries}
        />
      </div>
      {/* Undo Toast */}
      {deletedEntryState && (
        <div 
          className="fixed bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-6 px-5 py-3.5 rounded-full shadow-lg border text-sm font-sans"
          style={{ 
            backgroundColor: currentTheme.surface, 
            borderColor: currentTheme.surfaceBorder,
            color: currentTheme.textPrimary
          }}
        >
          <span className="font-medium tracking-wide">Page moved to trash.</span>
          <button 
            onClick={handleUndoDelete}
            className="font-bold cursor-pointer active:opacity-70 transition-opacity uppercase tracking-widest text-[11px]"
            style={{ color: currentTheme.textSecondary }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
