/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, ChangeEvent, useRef, useCallback, useMemo } from 'react';
import { JournalEntry, MinimalThemeId } from './types';
import { MINIMAL_THEMES } from './themeData';
import Sidebar from './components/Sidebar';
import { getSavedDirectoryHandleInfo, requestDirectoryPermission, promptDirectorySelection, loadEntriesFromDirectory, saveEntryToDirectory, deleteEntryFromDirectory, disconnectDirectory } from './lib/fsStorage';
import Editor from './components/Editor';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, RefreshCw, ArrowUpFromLine, ArrowDownToLine, Cloud, Info, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { get, set, del } from 'idb-keyval';
import { initAuth, googleSignIn, getAccessToken, logout } from './lib/auth';
import { registerDeviceLock, verifyDeviceLock } from './lib/webauthn';
import { mergeEntries } from './lib/syncMerge';
import { clearData } from './lib/clearData';

const ENTRIES_STORAGE_KEY = 'minimal-journal-entries';
const THEME_STORAGE_KEY = 'minimal-journal-theme';
const DRIVE_FILE_ID_KEY = 'minimal-journal-drive-file-id';
const APP_PASSWORD_KEY = 'minimal-journal-password';
const APP_SYSLOCK_KEY = 'minimal-journal-syslock';
const APP_SETTINGS_KEY = 'minimal-journal-settings';

const triggerNotification = async (title: string, body: string) => {
  if (!("Notification" in window)) return;
  
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return;
  }

  const isSubFolder = window.location.pathname.startsWith('/opnjrnl');
  const iconUrl = isSubFolder ? '/opnjrnl/icon.svg' : '/icon.svg';

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && "showNotification" in reg) {
        await reg.showNotification(title, {
          body: body,
          icon: iconUrl,
          badge: iconUrl,
          vibrate: [200, 100, 200],
          tag: 'opnjrnl-reminder',
          renotify: true
        } as any);
        return;
      }
    } catch (e) {
      console.warn("ServiceWorker showNotification failed, trying fallback:", e);
    }
  }

  try {
    new Notification(title, {
      body: body,
      icon: iconUrl
    });
  } catch (e) {
    console.error("Standard Notification constructor failed:", e);
  }
};

export default function App() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [themeId, setThemeId] = useState<MinimalThemeId>('paper');
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [lastKnownEntry, setLastKnownEntry] = useState<JournalEntry | null>(null);

  useEffect(() => {
    if (activeEntryId) {
      const entry = entries.find(e => e.id === activeEntryId);
      if (entry) setLastKnownEntry(entry);
    }
  }, [activeEntryId, entries]);

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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);
  const [isSyncingBackground, setIsSyncingBackground] = useState(false);
  const [cloudProgressScreen, setCloudProgressScreen] = useState<{ title: string; subtitle: string } | null>(null);
  const [syncChoiceData, setSyncChoiceData] = useState<{
    accessToken: string;
    user: any;
    localCount: number;
    cloudCount: number;
    cloudEntries: any[];
    activeFileId: string | null;
    isManualSync?: boolean;
  } | null>(null);
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
      get<{ notificationsEnabled: boolean, notificationTime: string }>(APP_SETTINGS_KEY),
      getSavedDirectoryHandleInfo()
    ]).then(async ([storedEntries, storedThemeId, storedPassword, storedSyslock, storedSettings, dirHandleInfo]) => {
      if (dirHandleInfo) {
        setDirHandle(dirHandleInfo.handle);
        if (!dirHandleInfo.requiresPermission) {
          const dirEntries = await loadEntriesFromDirectory(dirHandleInfo.handle);
          setEntries(dirEntries);
        } else {
          // Requires permission, let UI prompt, load IDB fallback for now
          if (storedEntries) {
            const polished = storedEntries.map(entry => ({
              ...entry,
              tags: entry.tags || []
            }));
            setEntries(polished);
          }
        }
      } else if (storedEntries) {
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
      console.error("Storage load error:", err);
      setIsLoaded(true);
    });


    // Request notification permission on load just in case (if we want to use them)
    if ("Notification" in window) {
       Notification.requestPermission();
    }

    // Initialize Auth
    initAuth(
      (user, token) => {
        setCurrentUser(user);
        setDriveConnected(!!token);
      },
      () => {
        setDriveConnected(false);
        setCurrentUser(null);
      }
    );
  }, []);

  const createOrUploadBackup = async (dataToSync: JournalEntry[], accessToken: string, existingFileId: string | null) => {
    const mimeType = 'application/json';
    const dataStr = JSON.stringify(dataToSync);
    
    if (existingFileId) {
      const updateRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': mimeType
        },
        body: dataStr
      });
      if (!updateRes.ok) throw new Error("Cloud update failed");
      await set(DRIVE_FILE_ID_KEY, existingFileId);
    } else {
      const metadata = {
        name: 'opnjrnl_backup.json',
        mimeType,
        parents: ['appDataFolder']
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
  };

  const handleResolveMerge = async () => {
    if (!syncChoiceData) return;
    setCloudProgressScreen({ title: 'Merging Chapters', subtitle: 'Analyzing conflict states and generating consolidated cloud backup...' });
    const { accessToken, user, cloudEntries, activeFileId } = syncChoiceData;
    
    // Perform standard conflict-free merge
    const merged = mergeEntries(entries, cloudEntries);
    
    // Update local state and IndexedDB
    setEntries(merged);
    await set(ENTRIES_STORAGE_KEY, merged);
    
    // Upload consolidated data to Drive
    await createOrUploadBackup(merged, accessToken, activeFileId);
    
    setDriveConnected(true);
    setCurrentUser(user);
    setSyncChoiceData(null);
    setCloudProgressScreen(null);
  };

  const handleResolveOverwriteRemote = async () => {
    if (!syncChoiceData) return;
    setCloudProgressScreen({ title: 'Uploading Data', subtitle: 'Overwriting the backup in Google Cloud with your local instance state...' });
    const { accessToken, user, activeFileId } = syncChoiceData;
    
    // Upload local entries to Google Drive directly
    await createOrUploadBackup(entries, accessToken, activeFileId);
    
    setDriveConnected(true);
    setCurrentUser(user);
    setSyncChoiceData(null);
    setCloudProgressScreen(null);
  };

  const handleResolveOverwriteLocal = async () => {
    if (!syncChoiceData) return;
    setCloudProgressScreen({ title: 'Restoring Backup', subtitle: 'Downloading chapters from your Google Drive backup space...' });
    const { accessToken, user, cloudEntries, activeFileId } = syncChoiceData;
    
    // Save cloud entries locally
    setEntries(cloudEntries);
    await set(ENTRIES_STORAGE_KEY, cloudEntries);
    
    // Establish DRIVE_FILE_ID_KEY
    if (activeFileId) {
      await set(DRIVE_FILE_ID_KEY, activeFileId);
    }
    
    setDriveConnected(true);
    setCurrentUser(user);
    setSyncChoiceData(null);
    setCloudProgressScreen(null);
  };

  const handleConnectDrive = async () => {
    if (driveConnected) {
      setShowConfirmDisconnect(true);
      return;
    }

    setSyncErrorMessage(null);
    setCloudProgressScreen({ title: 'Connecting to Google', subtitle: 'Authenticating and establishing secure connection to your personal Google Drive storage. This will take just a moment...' });
    try {
      const res = await googleSignIn();
      if (res?.accessToken) {
        const accessToken = res.accessToken;
        
        // Find existing backup file inside Drive isolated AppData space
        const fileQ = encodeURIComponent("name = 'opnjrnl_backup.json' and trashed = false");
        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${fileQ}&fields=files(id)`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const fileData = await fileRes.json();
        
        let activeFileId: string | null = null;
        let cloudEntries: JournalEntry[] = [];
        
        if (fileData.files && fileData.files.length > 0) {
          activeFileId = fileData.files[0].id;
          try {
            const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${activeFileId}?alt=media`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (downloadRes.ok) {
              const fetched = await downloadRes.json();
              if (Array.isArray(fetched)) {
                cloudEntries = fetched;
              }
            }
          } catch (e) {
            console.warn("Failed to download existing Drive backup:", e);
          }
        }
        
        // If there's a pre-existing backup with entries, show user management option dialog
        if (activeFileId && cloudEntries.length > 0) {
          setSyncChoiceData({
            accessToken,
            user: res.user,
            localCount: entries.length,
            cloudCount: cloudEntries.length,
            cloudEntries,
            activeFileId
          });
        } else {
          // No cloud content or new account. Direct upload local state & connect
          await createOrUploadBackup(entries, accessToken, activeFileId);
          setDriveConnected(true);
          setCurrentUser(res.user);
        }
      }
    } catch (err) {
      console.error("Could not connect to Google accounts:", err);
      setSyncErrorMessage("Failed to connect to Google Drive. Please try again.");
    } finally {
      setCloudProgressScreen(null);
    }
  };

  const handleManualSync = async () => {
    if (!driveConnected || !currentUser) return;
    setSyncErrorMessage(null);
    setCloudProgressScreen({ title: 'Synchronizing', subtitle: 'Fetching remote state from Google Drive...' });
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("No access token available for manual sync");
      
      const fileQ = encodeURIComponent("name = 'opnjrnl_backup.json' and trashed = false");
      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${fileQ}&fields=files(id)`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!fileRes.ok) throw new Error("Failed to search Drive space");
      const fileData = await fileRes.json();
      
      let activeFileId: string | null = null;
      let cloudEntries: JournalEntry[] = [];
      
      if (fileData.files && fileData.files.length > 0) {
        activeFileId = fileData.files[0].id;
        try {
          const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${activeFileId}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (downloadRes.ok) {
            const fetched = await downloadRes.json();
            if (Array.isArray(fetched)) {
              cloudEntries = fetched;
            }
          }
        } catch (e) {
          console.warn("Failed to download existing Drive backup during manual sync:", e);
        }
      }
      
      // If we found remote entries, pop the choices dialog. Otherwise just push local state.
      if (activeFileId && cloudEntries.length > 0) {
        setSyncChoiceData({
          accessToken,
          user: currentUser,
          localCount: entries.length,
          cloudCount: cloudEntries.length,
          cloudEntries,
          activeFileId,
          isManualSync: true
        });
      } else {
        await createOrUploadBackup(entries, accessToken, activeFileId);
      }
    } catch (err) {
      console.error("Manual sync error:", err);
      setSyncErrorMessage("Manual sync failed. Please check your connection.");
    } finally {
      setCloudProgressScreen(null);
    }
  };

  const syncToDrive = async (dataToSync: JournalEntry[], token?: string | null, forceFetchFirst = false) => {
    const accessToken = token || await getAccessToken();
    if (!accessToken) return;

    setSyncErrorMessage(null);
    setIsSyncingBackground(true);
    try {
      let fileId = await get<string>(DRIVE_FILE_ID_KEY);
      const dataStr = JSON.stringify(dataToSync);
      const mimeType = 'application/json';

      // Helper to find the backup file inside the isolated appDataFolder space
      const findFileInAppData = async (): Promise<string | null> => {
        const fileQ = encodeURIComponent("name = 'opnjrnl_backup.json' and trashed = false");
        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${fileQ}&fields=files(id)`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const fileData = await fileRes.json();
        if (fileData.files && fileData.files.length > 0) {
          return fileData.files[0].id;
        }
        return null;
      };

      // 1. Direct short-circuit if we have cached ID and are not performing full merges
      if (fileId && !forceFetchFirst) {
        try {
          const updateRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': mimeType
            },
            body: dataStr
          });
          if (updateRes.status === 200 || updateRes.status === 204) {
            return; // Success
          }
          if (updateRes.status === 404) {
            fileId = null; // Stale ID, fall through to resolve
          }
        } catch (e) {
          console.warn("Direct patch update failed, running full resolution pattern", e);
        }
      }

      // 2. Resolve active backup file ID from application isolated space
      const activeFileId = fileId || await findFileInAppData();

      if (activeFileId) {
        if (forceFetchFirst) {
          try {
            const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${activeFileId}?alt=media`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (downloadRes.ok) {
              const cloudEntries = await downloadRes.json();
              if (Array.isArray(cloudEntries)) {
                // Perform two-way conflict-free merge
                const merged = mergeEntries(dataToSync, cloudEntries);
                
                // Write merged results back to current browser state
                setEntries(merged);
                
                // Update remote backup file inside the hidden appDataFolder with merged data
                await fetch(`https://www.googleapis.com/upload/drive/v3/files/${activeFileId}?uploadType=media`, {
                  method: 'PATCH',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': mimeType
                  },
                  body: JSON.stringify(merged)
                });
                
                await set(DRIVE_FILE_ID_KEY, activeFileId);
                return;
              }
            }
          } catch (err) {
            console.error("Could not fetch or merge pre-existing backup indices on Drive:", err);
          }
        }

        // Standard patch update
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${activeFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': mimeType
          },
          body: dataStr
        });
        await set(DRIVE_FILE_ID_KEY, activeFileId);

      } else {
        // Create new backup file inside the isolated appDataFolder parents list
        const metadata = {
          name: 'opnjrnl_backup.json',
          mimeType,
          parents: ['appDataFolder']
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
      setSyncErrorMessage("Background sync failed. Please check your connection.");
    } finally {
      setIsSyncingBackground(false);
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

  // Auto-clear sync error message after 5 seconds
  useEffect(() => {
    if (syncErrorMessage) {
      const timer = setTimeout(() => {
        setSyncErrorMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [syncErrorMessage]);

  const handleSelectTheme = (id: string) => {
    if (MINIMAL_THEMES[id]) {
      setThemeId(id as MinimalThemeId);
    }
  };

  const handleNewEntry = () => {
    clearUndoState();
    const newEntry: JournalEntry = {
      id: uuidv4(),
      title: "",
      content: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
    };
    setEntries(current => {
      if (dirHandle) saveEntryToDirectory(dirHandle, newEntry);
      return [newEntry, ...current];
    });
    setActiveEntryId(newEntry.id);
  };

  const handleUpdateEntry = useCallback((id: string, updates: Partial<JournalEntry>) => {
    setEntries(current => {
      const newEntries = current.map(entry =>
        entry.id === id ? { ...entry, ...updates } : entry
      );
      if (dirHandle) {
        const updatedEntry = newEntries.find(e => e.id === id);
        if (updatedEntry) saveEntryToDirectory(dirHandle, updatedEntry);
      }
      return newEntries;
    });
  }, [dirHandle]);

  const handleDeleteEntry = useCallback((id: string) => {
    setEntries(current => {
      const entryToDelete = current.find(e => e.id === id);
      if (entryToDelete) {
        setDeletedEntryState({ entry: entryToDelete });
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = setTimeout(() => {
          setDeletedEntryState(null);
        }, 10000);
      }
      if (dirHandle) {
        deleteEntryFromDirectory(dirHandle, id);
      }
      return current.filter(entry => entry.id !== id);
    });

    setActiveEntryId(current => (current === id ? null : current));
  }, [dirHandle]);

  const handleUndoDelete = (e?: any) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (deletedEntryState) {
      setEntries(current => {
        if (dirHandle) saveEntryToDirectory(dirHandle, deletedEntryState.entry);
        return [deletedEntryState.entry, ...current].sort((a, b) => b.createdAt - a.createdAt);
      });
      clearUndoState();
    }
  };

  const handleClearAllData = async (options?: { deleteCloudBackup?: boolean }) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    await clearData(
      {
        getAccessToken,
        driveFileIdGet: () => get<string>(DRIVE_FILE_ID_KEY),
        driveFileIdDel: () => del(DRIVE_FILE_ID_KEY),
        logout,
        driveFetch: fetch,
        entriesDel: () => del(ENTRIES_STORAGE_KEY),
        appPasswordDel: () => del(APP_PASSWORD_KEY),
        syslockDel: () => del(APP_SYSLOCK_KEY),
        localStorageRemoveItem: (key: string) => localStorage.removeItem(key),
      },
      options,
    );

    setDriveConnected(false);
    setCurrentUser(null);
    setEntries([]);
    setActiveEntryId(null);
    clearUndoState();
    setAppPassword(null);
    setSystemLockId(null);
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
                isFavorite: !!item.isFavorite,
                attachments: Array.isArray(item.attachments) ? item.attachments : undefined
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
          triggerNotification("Journal Reminder", "Time to log your day in your journal.");
          localStorage.setItem('last-notif-fired', todayStr);
        }
      }
    }, 60000); // checks every minute...

    return () => clearInterval(interval);
  }, [notificationsEnabled, notificationTime]);

  const currentTheme = MINIMAL_THEMES[themeId] || MINIMAL_THEMES.paper;
  const activeEntry = entries.find(e => e.id === activeEntryId) || lastKnownEntry || null;

  const tagsString = useMemo(() => {
    return Array.from(new Set<string>(entries.flatMap(e => e.tags || [])))
      .map(t => t.trim())
      .filter(Boolean)
      .sort()
      .join(',');
  }, [entries]);

  const allUserTags = useMemo(() => {
    return tagsString ? tagsString.split(',') : [];
  }, [tagsString]);

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
          <h1 className="font-serif text-xl tracking-tight">Journal locked</h1>
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
            Use device lock
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
            {pwdError && <p className="text-zinc-600 dark:text-zinc-400 text-[10px] mt-2 text-center">Incorrect password</p>}
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
        className={`transition-all duration-300 ease-in-out shrink-0 h-full flex w-full md:w-[350px] lg:w-[390px]`}
      >
        <Sidebar
          vaultName={dirHandle ? dirHandle.name : null}
          onSelectVault={async () => {
            const handle = await promptDirectorySelection();
            if (handle) {
              setDirHandle(handle);
              const dirEntries = await loadEntriesFromDirectory(handle);
              if (dirEntries.length > 0) {
                setEntries(dirEntries);
                alert(`Loaded ${dirEntries.length} entries from vault.`);
              } else {
                alert(`Vault connected. Found 0 entries.`);
              }
            }
          }}
          onDisconnectVault={async () => {
            await disconnectDirectory();
            setDirHandle(null);
            alert("Disconnected local vault.");
          }}
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
          onClearAllData={handleClearAllData}
          onConnectDrive={handleConnectDrive}
          onManualSync={handleManualSync}
          driveConnected={driveConnected}
          isSyncingBackground={isSyncingBackground}
          syncError={!!syncErrorMessage}
          currentUser={currentUser}
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
          onTestNotification={() => {
            triggerNotification(
              "Journal Reminder Test", 
              "Success! Your daily garden reminder system is fully operational."
            );
          }}
        />
      </div>

      {/* Desktop Editor container */}
      <div 
        className="hidden md:flex md:flex-1 md:flex-col min-w-0"
        style={{ backgroundColor: currentTheme.surface }}
      >
        <Editor
          entry={activeEntry}
          onUpdate={handleUpdateEntry}
          onDelete={handleDeleteEntry}
          theme={currentTheme}
          allUserTags={allUserTags}
          driveConnected={driveConnected}
        />
      </div>

      {/* Mobile Editor sliding container */}
      <AnimatePresence>
        {activeEntryId && (
          <motion.div 
            key="mobile-editor"
            initial={{ x: "100%", opacity: 0.95 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.95 }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="md:hidden fixed inset-0 z-40 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
            style={{ backgroundColor: currentTheme.surface }}
          >
            {/* Mobile secondary tool header */}
            <div 
              className="px-6 py-4 flex items-center justify-between sticky top-0 z-10 transition-colors duration-300 shrink-0"
              style={{ 
                borderBottom: `1px solid ${currentTheme.surfaceBorder}`,
                backgroundColor: currentTheme.surface,
                color: currentTheme.textPrimary
              }}
            >
              <button
                onClick={() => setActiveEntryId(null)}
                className="flex items-center text-xs font-medium tracking-wide transition-all uppercase cursor-pointer interactive-target-44"
                style={{ color: currentTheme.accent }}
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                <span>Timeline</span>
              </button>
              <span className="text-[10px] tracking-[0.2em] uppercase font-semibold opacity-44 select-none">
                Composition
              </span>
              <div className="w-12 shrink-0" /> {/* Spacer */}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <Editor
                entry={activeEntry}
                onUpdate={handleUpdateEntry}
                onDelete={handleDeleteEntry}
                theme={currentTheme}
                allUserTags={allUserTags}
                driveConnected={driveConnected}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

      {/* Cloud Sync Error Toast */}
      <AnimatePresence>
        {syncErrorMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 55, scale: 0.95 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-full shadow-lg border text-xs font-sans bg-rose-500/15 border-rose-500/30 text-rose-500"
            style={{ backdropFilter: 'blur(10px)' }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-semibold tracking-wide">{syncErrorMessage}</span>
            <button 
              onClick={() => setSyncErrorMessage(null)}
              className="ml-2 font-bold opacity-75 hover:opacity-100 p-1 cursor-pointer"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disconnect Confirmation Custom Dialog */}
      <AnimatePresence>
        {showConfirmDisconnect && (
          <div className="fixed inset-0 bg-black/40 dark:bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 cursor-default" 
              onClick={() => setShowConfirmDisconnect(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="w-full max-w-sm rounded-[24px] p-6.5 shadow-2xl border flex flex-col gap-5 font-sans relative z-10"
              style={{ backgroundColor: currentTheme.surface, borderColor: currentTheme.surfaceBorder, color: currentTheme.textPrimary }}
            >
              <div className="flex gap-4 items-start">
                <div className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center bg-rose-500/10 text-rose-500">
                  <Cloud className="w-5 h-5" />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <h3 className="text-base font-bold tracking-tight">Disconnect Cloud Sync</h3>
                  <p className="opacity-70 text-[11.5px] leading-relaxed">
                    Are you sure you want to stop cloud backup? Your journal data remains safe on this device, but automatically syncing changes to Google Drive will pause.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-1">
                <button
                  onClick={() => setShowConfirmDisconnect(false)}
                  className="py-2.5 px-4 rounded-xl text-center font-bold tracking-tight transition-all hover:bg-black/[0.04] dark:hover:bg-white/[0.04] active:scale-95 border cursor-pointer inline-flex items-center justify-center bg-transparent text-xs"
                  style={{ borderColor: currentTheme.surfaceBorder, color: currentTheme.textPrimary }}
                >
                  Keep Connected
                </button>
                <button
                  onClick={async () => {
                    try {
                      await logout();
                      setDriveConnected(false);
                      setCurrentUser(null);
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setShowConfirmDisconnect(false);
                    }
                  }}
                  className="py-2.5 px-4 rounded-xl text-center font-bold tracking-tight transition-all bg-rose-500 hover:bg-rose-600 active:scale-95 text-white cursor-pointer shadow-sm text-center inline-flex items-center justify-center text-xs"
                >
                  Disconnect Sync
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cloud Sync Reconcile Choices Dialog */}
      <AnimatePresence>
        {syncChoiceData && (
          <div className="fixed inset-0 bg-black/40 dark:bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 cursor-default" 
              onClick={() => {
                if (!syncChoiceData.isManualSync) {
                  logout();
                }
                setSyncChoiceData(null);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="w-full max-w-lg max-h-[90vh] sm:max-h-[85vh] overflow-y-auto rounded-2xl md:rounded-3xl p-5 sm:p-6 md:p-8 shadow-2xl border flex flex-col gap-4 sm:gap-5.5 font-sans relative z-10 text-left scrollbar-thin"
              style={{ backgroundColor: currentTheme.surface, borderColor: currentTheme.surfaceBorder, color: currentTheme.textPrimary }}
            >
              <div className="flex flex-col gap-1 pr-4">
                <span className="text-[10px] tracking-widest uppercase opacity-45 font-bold font-mono">Google Cloud Sync</span>
                <h3 className="text-xl font-bold font-serif tracking-tight">Chapters Alignment Options</h3>
                <p className="opacity-70 text-xs leading-relaxed mt-1">
                  Welcome back, <span className="font-semibold">{syncChoiceData.user?.displayName || "Writer"}</span>. We found pre-existing chapters in your Google Drive storage. Choose how you would like to run this device's synchronization:
                </p>
              </div>

              {/* Counts Grid Comparison */}
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-2xl border p-4 flex flex-col items-center gap-0.5" style={{ borderColor: currentTheme.surfaceBorder, backgroundColor: currentTheme.surface }}>
                  <span className="text-[9px] tracking-wider uppercase opacity-40 font-mono font-bold">Local Device</span>
                  <span className="text-2xl font-serif font-black">{syncChoiceData.localCount}</span>
                  <span className="text-[10px] opacity-60">journal pages</span>
                </div>
                <div className="rounded-2xl border p-4 flex flex-col items-center gap-0.5" style={{ borderColor: currentTheme.surfaceBorder, backgroundColor: currentTheme.surface }}>
                  <span className="text-[9px] tracking-wider uppercase opacity-40 font-mono font-bold">Google Cloud copy</span>
                  <span className="text-2xl font-serif font-black">{syncChoiceData.cloudCount}</span>
                  <span className="text-[10px] opacity-60">remote pages</span>
                </div>
              </div>

              {/* Selectable resolution options */}
              <div className="flex flex-col gap-3">
                {/* 1. Merge (Recommended) */}
                <button
                  onClick={handleResolveMerge}
                  className="w-full p-4 rounded-2xl border text-left flex gap-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] active:scale-98 transition-all duration-200 cursor-pointer text-xs"
                  style={{ borderColor: currentTheme.accent }}
                >
                  <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-blue-500/10 text-blue-500">
                    <RefreshCw className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold tracking-tight text-sm">Merge & Combine Entries</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold tracking-wider uppercase bg-blue-500/10 text-blue-500 font-sans">
                        Recommended
                      </span>
                    </div>
                    <p className="opacity-75 text-[10.5px] leading-relaxed mt-1">
                      Merges both local and cloud chapters together neatly. If any modifications conflict, the latest edit timestamps win. No data will be lost.
                    </p>
                  </div>
                </button>

                {/* 2. Overwrite Remote (Keep Local) */}
                <button
                  onClick={handleResolveOverwriteRemote}
                  className="w-full p-4 rounded-2xl border text-left flex gap-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] active:scale-98 transition-all duration-200 cursor-pointer text-xs"
                  style={{ borderColor: currentTheme.surfaceBorder }}
                >
                  <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-zinc-500/10 text-zinc-500">
                    <ArrowUpFromLine className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold tracking-tight text-sm">Upload local chapters</span>
                    <p className="opacity-75 text-[10.5px] leading-relaxed mt-1">
                      Replaces the archive in Google Cloud with pages present on this local device. (Local state replaces Cloud backup)
                    </p>
                  </div>
                </button>

                {/* 3. Overwrite Local (Download Cloud) */}
                <button
                  onClick={handleResolveOverwriteLocal}
                  className="w-full p-4 rounded-2xl border text-left flex gap-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] active:scale-98 transition-all duration-200 cursor-pointer text-xs"
                  style={{ borderColor: currentTheme.surfaceBorder }}
                >
                  <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-zinc-500/10 text-zinc-500">
                    <ArrowDownToLine className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold tracking-tight text-sm">Restore from backup</span>
                    <p className="opacity-75 text-[10.5px] leading-relaxed mt-1">
                      Completely replaces local chapters on this device with the chapters present in your cloud backup.
                    </p>
                  </div>
                </button>
              </div>

              <div className="flex justify-center pt-2">
                <button
                  onClick={() => {
                    if (!syncChoiceData.isManualSync) {
                      logout();
                    }
                    setSyncChoiceData(null);
                  }}
                  className="text-[10px] font-bold tracking-wider uppercase opacity-45 hover:opacity-100 transition-opacity p-2 cursor-pointer"
                >
                  {syncChoiceData.isManualSync ? "Cancel manual sync" : "Cancel cloud integration"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cloud Sync Progress Blocking Dialog */}
      <AnimatePresence>
        {cloudProgressScreen && (
          <div className="fixed inset-0 bg-black/60 dark:bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-4 select-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="w-full max-w-xs rounded-3xl p-6 shadow-2xl border flex flex-col items-center gap-5 font-sans justify-center text-center relative z-10"
              style={{ backgroundColor: currentTheme.surface, borderColor: currentTheme.surfaceBorder, color: currentTheme.textPrimary }}
            >
              <div className="relative flex items-center justify-center w-14 h-14">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                <Cloud className="w-4 h-4 text-blue-500 absolute" />
              </div>
              <div className="flex flex-col gap-1.5 min-w-0">
                <span className="text-[10px] tracking-widest uppercase opacity-45 font-bold font-mono">Google Cloud Sync</span>
                <h3 className="text-sm font-bold tracking-tight">{cloudProgressScreen.title}</h3>
                <p className="opacity-70 text-[11px] leading-relaxed">
                  {cloudProgressScreen.subtitle}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
