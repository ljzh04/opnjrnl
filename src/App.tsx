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
import { initAuth, googleSignIn, getAccessToken, logout, startTokenRefresh, stopTokenRefresh, setRefreshStateCallback, setRefreshSuccessCallback, isAutoRefreshEnabled as getAutoRefreshSetting, setAutoRefreshEnabled as setAutoRefreshSetting } from './lib/auth';
import { registerDeviceLock, verifyDeviceLock } from './lib/webauthn';
import { mergeEntries } from './lib/syncMerge';
import { clearData } from './lib/clearData';

const ENTRIES_STORAGE_KEY = 'minimal-journal-entries';
const THEME_STORAGE_KEY = 'minimal-journal-theme';
const DRIVE_FILE_ID_KEY = 'minimal-journal-drive-file-id';
const APP_PASSWORD_KEY = 'minimal-journal-password';
const APP_SYSLOCK_KEY = 'minimal-journal-syslock';
const APP_SETTINGS_KEY = 'minimal-journal-settings';
const ARCHIVE_FILE_NAME = 'opnjrnl_archive.json';
const LOCAL_ARCHIVE_KEY = 'minimal-journal-local-archive';

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

  const entriesRef = useRef<JournalEntry[]>(entries);
  entriesRef.current = entries;
  const dirHandleRef = useRef<any>(dirHandle);
  dirHandleRef.current = dirHandle;
  const isDataReadyRef = useRef(false);

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
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabledLocal] = useState(getAutoRefreshSetting());
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
  const syncInProgressRef = useRef(false);
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
      const polished = (storedEntries || []).map(entry => ({
        ...entry,
        tags: entry.tags || []
      }));

      if (dirHandleInfo) {
        setDirHandle(dirHandleInfo.handle);
        if (!dirHandleInfo.requiresPermission) {
          try {
            const dirEntries = await loadEntriesFromDirectory(dirHandleInfo.handle);
            if (dirEntries.length > 0) {
              const merged = mergeEntries(polished, dirEntries);
              setEntries(merged);
            } else if (polished.length > 0) {
              setEntries(polished);
            }
          } catch {
            if (polished.length > 0) setEntries(polished);
          }
        } else {
          if (polished.length > 0) setEntries(polished);
        }
      } else if (polished.length > 0) {
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
      isDataReadyRef.current = true;
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
    setRefreshStateCallback(setIsRefreshingToken);
    setRefreshSuccessCallback(() => {
      setDriveConnected(true);
    });
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

  // Start/stop token refresh loop when auto-refresh setting changes
  useEffect(() => {
    if (currentUser && autoRefreshEnabled) {
      startTokenRefresh();
    } else {
      stopTokenRefresh();
    }
    return () => stopTokenRefresh();
  }, [currentUser, autoRefreshEnabled]);

  const handleToggleAutoRefresh = (enabled: boolean) => {
    setAutoRefreshSetting(enabled);
    setAutoRefreshEnabledLocal(enabled);
  };

  const findDriveBackupFile = async (accessToken: string): Promise<string | null> => {
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

  const downloadDriveBackup = async (accessToken: string, fileId: string): Promise<JournalEntry[] | null> => {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (e) {
      console.warn("Failed to download Drive backup:", e);
    }
    return null;
  };

  const findDriveFileByName = async (accessToken: string, name: string): Promise<string | null> => {
    const q = encodeURIComponent(`name = '${name}' and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    return data.files?.[0]?.id || null;
  };

  const archiveEntries = async (accessToken: string, entries: JournalEntry[]): Promise<void> => {
    const archiveFileId = await findDriveFileByName(accessToken, ARCHIVE_FILE_NAME);
    const payload = JSON.stringify(entries);
    if (archiveFileId) {
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${archiveFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: payload
      });
    } else {
      const metadata = { name: ARCHIVE_FILE_NAME, mimeType: 'application/json', parents: ['appDataFolder'] };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([payload], { type: 'application/json' }));
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
      });
    }
  };

  const createOrUploadBackup = async (dataToSync: JournalEntry[], accessToken: string, existingFileId: string | null) => {
    // ponytail: archives previous cloud state to Drive before overwriting
    if (existingFileId) {
      try {
        const currentCloud = await downloadDriveBackup(accessToken, existingFileId);
        if (currentCloud && currentCloud.length > 0) {
          await archiveEntries(accessToken, currentCloud);
        }
      } catch (e) {
        console.warn('Archive save skipped:', e);
      }
    }
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
    setCloudProgressScreen({ title: 'Combining entries', subtitle: 'Merging entries from this device and Drive into one backup...' });
    const { accessToken, user, cloudEntries, activeFileId } = syncChoiceData;
    
    const merged = mergeEntries(entriesRef.current, cloudEntries);
    
    setEntries(merged);
    await set(ENTRIES_STORAGE_KEY, merged);
    
    await createOrUploadBackup(merged, accessToken, activeFileId);
    
    setDriveConnected(true);
    setCurrentUser(user);
    setSyncChoiceData(null);
    setCloudProgressScreen(null);
  };

  const handleResolveOverwriteRemote = async () => {
    if (!syncChoiceData) return;
    setCloudProgressScreen({ title: 'Saving to Drive', subtitle: 'Replacing the Drive backup with entries from this device...' });
    const { accessToken, user, activeFileId } = syncChoiceData;
    
    await createOrUploadBackup(entriesRef.current, accessToken, activeFileId);
    
    setDriveConnected(true);
    setCurrentUser(user);
    setSyncChoiceData(null);
    setCloudProgressScreen(null);
  };

  const handleResolveOverwriteLocal = async () => {
    if (!syncChoiceData) return;
    setCloudProgressScreen({ title: 'Restoring from Drive', subtitle: 'Downloading entries from your Drive backup...' });
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
    setCloudProgressScreen({ title: 'Connecting to Google Drive', subtitle: 'Signing in and connecting to your Drive. This will take just a moment...' });
    try {
      const res = await googleSignIn();
      if (res?.accessToken) {
        const accessToken = res.accessToken;
        
        const activeFileId = await findDriveBackupFile(accessToken);
        let cloudEntries: JournalEntry[] = [];
        
        if (activeFileId) {
          cloudEntries = await downloadDriveBackup(accessToken, activeFileId) || [];
        }
        
        // If there's a pre-existing backup with entries, show user management option dialog
        if (activeFileId && cloudEntries.length > 0) {
          setSyncChoiceData({
            accessToken,
            user: res.user,
            localCount: entriesRef.current.length,
            cloudCount: cloudEntries.length,
            cloudEntries,
            activeFileId
          });
        } else {
          // No cloud content or new account. Direct upload local state & connect
          await createOrUploadBackup(entriesRef.current, accessToken, activeFileId);
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
    setCloudProgressScreen({ title: 'Backing up', subtitle: 'Checking backup on Google Drive...' });
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("No access token available for manual sync");
      
      const activeFileId = await findDriveBackupFile(accessToken);
      let cloudEntries: JournalEntry[] = [];
      
      if (activeFileId) {
        cloudEntries = await downloadDriveBackup(accessToken, activeFileId) || [];
      }
      
      // If we found remote entries, pop the choices dialog. Otherwise just push local state.
      if (activeFileId && cloudEntries.length > 0) {
        setSyncChoiceData({
          accessToken,
          user: currentUser,
          localCount: entriesRef.current.length,
          cloudCount: cloudEntries.length,
          cloudEntries,
          activeFileId,
          isManualSync: true
        });
      } else {
        await createOrUploadBackup(entriesRef.current, accessToken, activeFileId);
      }
    } catch (err) {
      console.error("Manual sync error:", err);
      setSyncErrorMessage("Backup failed. Please check your connection.");
    } finally {
      setCloudProgressScreen(null);
    }
  };

  const syncToDrive = async (dataToSync: JournalEntry[], token?: string | null, forceFetchFirst = false) => {
    // ponytail: global lock, per-account locks if concurrent writes become an issue
    if (syncInProgressRef.current) { console.warn('Sync already in progress, skipping'); return; }
    syncInProgressRef.current = true;
    const accessToken = token || await getAccessToken();
    if (!accessToken) { syncInProgressRef.current = false; return; }

    setSyncErrorMessage(null);
    setIsSyncingBackground(true);
    try {
      let fileId = await get<string>(DRIVE_FILE_ID_KEY);
      const mimeType = 'application/json';

      // 1. Direct short-circuit if we have cached ID and are not performing full merges
      if (fileId && !forceFetchFirst) {
        try {
          const updateRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': mimeType
            },
            body: JSON.stringify(dataToSync)
          });
          if (updateRes.status === 200 || updateRes.status === 204) {
            return;
          }
          if (updateRes.status === 404) {
            fileId = null;
          }
        } catch (e) {
          console.warn("Direct patch update failed, running full resolution pattern", e);
        }
      }

      // 2. Resolve active backup file ID
      const activeFileId = fileId || await findDriveBackupFile(accessToken);

      if (activeFileId) {
        // If local data is empty but cloud has data, always merge to prevent data loss
        const shouldMerge = forceFetchFirst || dataToSync.length === 0;
        if (shouldMerge) {
          const cloudEntries = await downloadDriveBackup(accessToken, activeFileId);
          if (cloudEntries && cloudEntries.length > 0) {
            const merged = mergeEntries(dataToSync, cloudEntries);
            setEntries(merged);
            set(ENTRIES_STORAGE_KEY, merged).catch(console.error);
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

        // Standard patch update
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${activeFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': mimeType
          },
          body: JSON.stringify(dataToSync)
        });
        await set(DRIVE_FILE_ID_KEY, activeFileId);

      } else {
        // No backup exists yet, only create if we have data to upload
        if (dataToSync.length > 0) {
          const metadata = {
            name: 'opnjrnl_backup.json',
            mimeType,
            parents: ['appDataFolder']
          };

          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          form.append('file', new Blob([JSON.stringify(dataToSync)], { type: mimeType }));

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
      }

    } catch (err) {
      console.error("Drive sync error:", err);
      setSyncErrorMessage("Backup failed. Please check your connection.");
    } finally {
      syncInProgressRef.current = false;
      setIsSyncingBackground(false);
    }
  };

  // Sync entries to storage
  useEffect(() => {
    if (isLoaded && isDataReadyRef.current) {
      set(ENTRIES_STORAGE_KEY, entries).catch(console.error);

      // Debounced Drive Sync — always merge-first to prevent overwriting cloud with stale local data
      if (driveConnected) {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => {
          syncToDrive(entriesRef.current, null, true);
        }, 10000);
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
    const currentHandle = dirHandleRef.current;
    setEntries(current => [newEntry, ...current]);
    if (currentHandle) saveEntryToDirectory(currentHandle, newEntry);
    setActiveEntryId(newEntry.id);
  };

  const handleUpdateEntry = useCallback((id: string, updates: Partial<JournalEntry>) => {
    const currentHandle = dirHandleRef.current;
    setEntries(current => {
      const newEntries = current.map(entry =>
        entry.id === id ? { ...entry, ...updates } : entry
      );
      if (currentHandle) {
        const updatedEntry = newEntries.find(e => e.id === id);
        if (updatedEntry) saveEntryToDirectory(currentHandle, updatedEntry);
      }
      return newEntries;
    });
  }, []);

  const handleDeleteEntry = useCallback((id: string) => {
    set(LOCAL_ARCHIVE_KEY, entriesRef.current).catch(console.error);
    const currentHandle = dirHandleRef.current;
    setEntries(current => {
      const entryToDelete = current.find(e => e.id === id);
      if (entryToDelete) {
        setDeletedEntryState({ entry: entryToDelete });
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = setTimeout(() => {
          setDeletedEntryState(null);
        }, 10000);
      }
      if (currentHandle) {
        deleteEntryFromDirectory(currentHandle, id);
      }
      return current.filter(entry => entry.id !== id);
    });

    setActiveEntryId(current => (current === id ? null : current));
  }, []);

  const handleUndoDelete = (e?: any) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (deletedEntryState) {
      const currentHandle = dirHandleRef.current;
      setEntries(current => [deletedEntryState.entry, ...current].sort((a, b) => b.createdAt - a.createdAt));
      if (currentHandle) saveEntryToDirectory(currentHandle, deletedEntryState.entry);
      clearUndoState();
    }
  };

  const handleClearAllData = async (options?: { deleteCloudBackup?: boolean }) => {
    set(LOCAL_ARCHIVE_KEY, entriesRef.current).catch(console.error);
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

            let importedCount = 0;
            setEntries(current => {
              const existingIds = new Set(current.map(c => c.id));
              const uniqueImported = verified.filter(v => {
                if (!existingIds.has(v.id)) {
                  importedCount++;
                  return true;
                }
                return false;
              });
              return [...uniqueImported, ...current];
            });

            const currentHandle = dirHandleRef.current;
            if (currentHandle) {
              for (const entry of verified) {
                saveEntryToDirectory(currentHandle, entry);
              }
            }

            alert(`Successfully restored ${importedCount} entries!`);
          } else {
            alert("Format invalid. Backup must be a valid JSON array.");
          }
        } catch (err) {
          alert("Failed to parse backup file: " + err);
        }
      };
    }
  };

  const handleRestoreFromArchive = async () => {
    if (!driveConnected) { alert('Connect to Google Drive first.'); return; }
    if (!confirm('Restore entries from Drive archive? This replaces all local entries with the archived state.')) return;
    setCloudProgressScreen({ title: 'Restoring from archive', subtitle: 'Downloading archive backup from Drive...' });
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('No token');
      const id = await findDriveFileByName(token, ARCHIVE_FILE_NAME);
      if (!id) { alert('No archive found on Drive.'); return; }
      const data = await downloadDriveBackup(token, id);
      if (!data || data.length === 0) { alert('Archive is empty.'); return; }
      setEntries(data);
      await set(ENTRIES_STORAGE_KEY, data);
      alert(`Restored ${data.length} entries from archive.`);
    } catch (e) {
      console.error(e);
      setSyncErrorMessage('Failed to restore from archive.');
    } finally {
      setCloudProgressScreen(null);
    }
  };

  const handleRestoreFromLocalArchive = async () => {
    try {
      const archived = await get<JournalEntry[]>(LOCAL_ARCHIVE_KEY);
      if (!archived || archived.length === 0) { alert('No local archive found.'); return; }
      if (!confirm(`Restore ${archived.length} entries from local archive? This replaces all current entries.`)) return;
      setEntries(archived);
      await set(ENTRIES_STORAGE_KEY, archived);
      alert(`Restored ${archived.length} entries from local archive.`);
    } catch (e) {
      console.error(e);
      alert('Failed to restore from local archive.');
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
        <span>Loading your journal...</span>
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
                alert(`Loaded ${dirEntries.length} entries from folder.`);
              } else {
                alert(`Folder connected. Found 0 entries.`);
              }
            }
          }}
          onDisconnectVault={async () => {
            await disconnectDirectory();
            setDirHandle(null);
            alert("Disconnected local folder.");
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
          onRestoreFromArchive={handleRestoreFromArchive}
          onRestoreFromLocalArchive={handleRestoreFromLocalArchive}
          onClearAllData={handleClearAllData}
          onConnectDrive={handleConnectDrive}
          onManualSync={handleManualSync}
          driveConnected={driveConnected}
          isSyncingBackground={isSyncingBackground}
          isRefreshingToken={isRefreshingToken}
          autoRefreshEnabled={autoRefreshEnabled}
          onToggleAutoRefresh={handleToggleAutoRefresh}
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
                  <h3 className="text-base font-bold tracking-tight">Disconnect from Drive</h3>
                  <p className="opacity-70 text-[11.5px] leading-relaxed">
                    Your entries are safe on this device, but automatic backups to Google Drive will stop.
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
                  Disconnect
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
                <span className="text-[10px] tracking-widest uppercase opacity-45 font-bold font-mono">Google Drive Backup</span>
                <h3 className="text-xl font-bold font-serif tracking-tight">Choose what to do</h3>
                <p className="opacity-70 text-xs leading-relaxed mt-1">
                  Welcome back, <span className="font-semibold">{syncChoiceData.user?.displayName || "Writer"}</span>. We found entries in your Google Drive backup. How would you like to proceed?
                </p>
              </div>

              {/* Counts Grid Comparison */}
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-2xl border p-4 flex flex-col items-center gap-0.5" style={{ borderColor: currentTheme.surfaceBorder, backgroundColor: currentTheme.surface }}>
                  <span className="text-[9px] tracking-wider uppercase opacity-40 font-mono font-bold">This device</span>
                  <span className="text-2xl font-serif font-black">{syncChoiceData.localCount}</span>
                  <span className="text-[10px] opacity-60">entries</span>
                </div>
                <div className="rounded-2xl border p-4 flex flex-col items-center gap-0.5" style={{ borderColor: currentTheme.surfaceBorder, backgroundColor: currentTheme.surface }}>
                  <span className="text-[9px] tracking-wider uppercase opacity-40 font-mono font-bold">Drive backup</span>
                  <span className="text-2xl font-serif font-black">{syncChoiceData.cloudCount}</span>
                  <span className="text-[10px] opacity-60">entries</span>
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
                      <span className="font-bold tracking-tight text-sm">Combine both</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold tracking-wider uppercase bg-blue-500/10 text-blue-500 font-sans">
                        Recommended
                      </span>
                    </div>
                    <p className="opacity-75 text-[10.5px] leading-relaxed mt-1">
                      Keep entries from both this device and your Drive backup. If the same entry was edited on both, the newest version is kept.
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
                    <span className="font-bold tracking-tight text-sm">Replace Drive backup</span>
                    <p className="opacity-75 text-[10.5px] leading-relaxed mt-1">
                      Replace the backup on Drive with entries from this device.
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
                    <span className="font-bold tracking-tight text-sm">Restore from Drive backup</span>
                    <p className="opacity-75 text-[10.5px] leading-relaxed mt-1">
                      Replace entries on this device with the ones from your Drive backup.
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
                  {syncChoiceData.isManualSync ? "Cancel" : "Cancel"}
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
                <span className="text-[10px] tracking-widest uppercase opacity-45 font-bold font-mono">Google Drive Backup</span>
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
