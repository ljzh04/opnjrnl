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
import { registerDeviceLock, verifyDeviceLock } from './lib/webauthn';

const ENTRIES_STORAGE_KEY = 'minimal-journal-entries';
const THEME_STORAGE_KEY = 'minimal-journal-theme';
const DRIVE_FILE_ID_KEY = 'minimal-journal-drive-file-id';
const APP_PASSWORD_KEY = 'minimal-journal-password';
const APP_SYSLOCK_KEY = 'minimal-journal-syslock';
const APP_SETTINGS_KEY = 'minimal-journal-settings';

export default function App() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [themeId, setThemeId] = useState<MinimalThemeId>('paper');
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  // App Lock & Settings
  const [appLocked, setAppLocked] = useState<boolean>(false);
  const [appPassword, setAppPassword] = useState<string | null>(null);
  const [systemLockId, setSystemLockId] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<boolean>(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [notificationTime, setNotificationTime] = useState<string>("20:00");

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [deletedEntryState, setDeletedEntryState] = useState<{ entry: JournalEntry } | null>(null);

  // Navigation & History State (System Back Interceptor)
  const [showSettings, setShowSettings] = useState(false);
  const [backToastActive, setBackToastActive] = useState(false);
  const backToastTimeoutRef = useRef<any>(null);

  const activeEntryIdRef = useRef<string | null>(null);
  activeEntryIdRef.current = activeEntryId;

  const showSettingsRef = useRef<boolean>(false);
  showSettingsRef.current = showSettings;

  const backToastActiveRef = useRef<boolean>(false);
  backToastActiveRef.current = backToastActive;

  // Cloud Sync properties
  const [driveConnected, setDriveConnected] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearUndoState = () => {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setDeletedEntryState(null);
  };

  // System Back Button Interceptor utilizing HTML5 History API
  useEffect(() => {
    window.history.replaceState({ type: 'exit-guard' }, '');
    window.history.pushState({ type: 'home' }, '');

    const handlePopState = (e: PopStateEvent) => {
      const state = e.state;
      if (state && state.type === 'exit-guard') {
        if (showSettingsRef.current) {
          setShowSettings(false);
          window.history.pushState({ type: 'home' }, '');
        } else if (activeEntryIdRef.current) {
          setActiveEntryId(null);
          window.history.pushState({ type: 'home' }, '');
        } else {
          if (backToastActiveRef.current) {
            window.history.go(-1);
          } else {
            setBackToastActive(true);
            window.history.pushState({ type: 'home' }, '');
            
            if (backToastTimeoutRef.current) clearTimeout(backToastTimeoutRef.current);
            backToastTimeoutRef.current = setTimeout(() => {
              setBackToastActive(false);
            }, 2000);
          }
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (backToastTimeoutRef.current) clearTimeout(backToastTimeoutRef.current);
    };
  }, []);

  // Initial persistent state restoration
  useEffect(() => {
    Promise.all([
      get<JournalEntry[]>(ENTRIES_STORAGE_KEY),
      get<MinimalThemeId>(THEME_STORAGE_KEY),
      get<string | null>(APP_PASSWORD_KEY),
      get<string | null>(APP_SYSLOCK_KEY),
      get<{ notificationsEnabled: boolean, notificationTime: string }>(APP_SETTINGS_KEY)
    ]).then(([storedEntries, storedThemeId, storedPassword, storedSyslock, storedSettings]) => {
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
      if (storedPassword) {
        setAppPassword(storedPassword);
        setAppLocked(true);
      }
      if (storedSyslock) {
        setSystemLockId(storedSyslock);
        setAppLocked(true);
      }
      if (storedSettings) {
        setNotificationsEnabled(storedSettings.notificationsEnabled);
        setNotificationTime(storedSettings.notificationTime || "20:00");
      }
      setIsLoaded(true);
    }).catch((err) => {
      console.error("IndexedDB load error:", err);
      setIsLoaded(true); // Proceed anyway with default values
    });

    // Request notification permission on load just in case (if we want to use them)
    if ("Notification" in window) {
       Notification.requestPermission();
    }

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

  const handleUndoDelete = (e?: any) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (deletedEntryState) {
      setEntries(current => [deletedEntryState.entry, ...current].sort((a, b) => b.createdAt - a.createdAt));
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

  // Notification Daemon Loop
  useEffect(() => {
    if (!notificationsEnabled || !notificationTime) return;
    
    // Check every minute
    const interval = setInterval(() => {
      const now = new Date();
      const currentHours = now.getHours().toString().padStart(2, '0');
      const currentMinutes = now.getMinutes().toString().padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMinutes}`;
      
      if (currentTimeStr === notificationTime) {
        // We only want to trigger it once during that minute.
        // We'll use a localStorage flag to prevent multi-firing within the same day
        const todayStr = new Date().toDateString();
        const lastFired = localStorage.getItem('last-notif-fired');
        if (lastFired !== todayStr) {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Journal Reminder", {
              body: "Time to log your day in your journal.",
              icon: "/icon.svg"
            });
            localStorage.setItem('last-notif-fired', todayStr);
          }
        }
      }
    }, 60000); // checks every minute...

    return () => clearInterval(interval);
  }, [notificationsEnabled, notificationTime]);

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

  if (appLocked) {
    return (
      <div 
        className="h-[100dvh] w-full flex flex-col gap-6 items-center justify-center font-sans text-xs tracking-wider select-none px-6"
        style={{ backgroundColor: currentTheme.background, color: currentTheme.textPrimary }}
      >
        <div className="w-12 h-12 rounded-full border flex items-center justify-center shadow-sm" style={{ borderColor: currentTheme.surfaceBorder, backgroundColor: currentTheme.surface }}>
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: currentTheme.textPrimary }}></div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-serif text-xl tracking-tight">Journal Locked</h1>
          <p className="opacity-50">Authenticate to continue</p>
        </div>
        
        {systemLockId && (
          <button 
            type="button"
            onClick={async () => {
              const success = await verifyDeviceLock(systemLockId);
              if (success) {
                setAppLocked(false);
                setPwdError(false);
              }
            }}
            className="w-full max-w-[240px] px-4 py-3 rounded-lg font-bold tracking-widest uppercase transition-all mt-4 shadow-sm active:scale-95 text-white"
            style={{ backgroundColor: currentTheme.accent }}
          >
            Use Device Lock
          </button>
        )}

        {appPassword && (
        <form 
          className="flex flex-col gap-3 w-full max-w-[240px] mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            const val = (e.currentTarget.elements.namedItem('pwd') as HTMLInputElement).value;
            if (val === appPassword) {
              setAppLocked(false);
              setPwdError(false);
            } else {
              setPwdError(true);
            }
          }}
        >
          <div>
            <input 
              type="password" 
              name="pwd"
              placeholder="Password" 
              autoFocus
              onChange={() => setPwdError(false)}
              className="w-full px-4 py-3 rounded-lg border text-center tracking-widest outline-none focus:border-zinc-400 transition-all font-mono"
              style={{ 
                borderColor: pwdError ? '#f43f5e' : currentTheme.surfaceBorder, 
                backgroundColor: currentTheme.surface, 
                color: currentTheme.textPrimary 
              }}
            />
            {pwdError && <p className="text-rose-500 text-[10px] uppercase font-bold mt-2 text-center tracking-widest">Incorrect password</p>}
          </div>
            <button 
              type="submit"
              className="w-full px-4 py-3 rounded-lg font-bold tracking-widest uppercase transition-all my-2 shadow-sm active:scale-95 text-white opacity-90"
              style={{ backgroundColor: currentTheme.accent }}
            >
              Unlock
            </button>
          </form>
        )}
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
          showSettings={showSettings}
          onToggleSettings={setShowSettings}
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
          appPassword={appPassword}
          onUpdateAppPassword={(pwd) => {
            setAppPassword(pwd);
            set(APP_PASSWORD_KEY, pwd).catch(console.error);
          }}
          systemLockId={systemLockId}
          onUpdateSystemLock={(id) => {
            setSystemLockId(id);
            set(APP_SYSLOCK_KEY, id).catch(console.error);
          }}
          notificationsEnabled={notificationsEnabled}
          notificationTime={notificationTime}
          onUpdateNotifications={(enabled, time) => {
            setNotificationsEnabled(enabled);
            setNotificationTime(time);
            set(APP_SETTINGS_KEY, { notificationsEnabled: enabled, notificationTime: time }).catch(console.error);
            if (enabled && "Notification" in window) {
               Notification.requestPermission();
            }
          }}
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
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-6 px-5 py-3.5 rounded-full shadow-lg border text-sm font-sans"
          style={{ 
            backgroundColor: currentTheme.surface, 
            borderColor: currentTheme.surfaceBorder,
            color: currentTheme.textPrimary
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <span className="font-medium tracking-wide">Deleted</span>
          <button 
            type="button"
            onClick={handleUndoDelete}
            className="font-bold cursor-pointer active:opacity-70 transition-opacity uppercase tracking-widest text-[11px]"
            style={{ color: currentTheme.textSecondary }}
          >
            Undo
          </button>
        </div>
      )}

      {/* Tap Back Again to Exit Toast */}
      {backToastActive && (
        <div 
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-6 px-5 py-3.5 rounded-full shadow-lg border text-sm font-sans"
          style={{ 
            backgroundColor: currentTheme.surface, 
            borderColor: currentTheme.surfaceBorder,
            color: currentTheme.textPrimary
          }}
        >
          <span className="font-medium tracking-wide">Tap back again to exit</span>
        </div>
      )}
    </div>
  );
}
