import { JournalEntry, MinimalTheme } from '../types';
import { format } from 'date-fns';
import { MOOD_SCALE } from '../themeData';
import { registerDeviceLock } from '../lib/webauthn';
import { driveStatusMeta, type DriveStatus } from '../lib/driveStatus';
import { 
  Plus, 
  Search, 
  Heart, 
  Trash2, 
  X,
  Settings,
  FileDown,
  FileUp,
  Folder,
  Smile,
  Meh,
  Frown,
  CloudRain,
  Sun,
  ChevronLeft,
  Cloud,
  RefreshCw,
  User,
  AlertTriangle
} from 'lucide-react';
import { useState, ChangeEvent, ReactNode, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const MOOD_ICONS: Record<string, ReactNode> = {
  terrible: <CloudRain className="w-[14px] h-[14px]" />,
  bad: <Frown className="w-[14px] h-[14px]" />,
  okay: <Meh className="w-[14px] h-[14px]" />,
  good: <Smile className="w-[14px] h-[14px]" />,
  great: <Sun className="w-[14px] h-[14px]" />,
};

interface SidebarProps {
  entries: JournalEntry[];
  activeEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onNewEntry: () => void;
  onDeleteEntry: (id: string) => void;
  theme: MinimalTheme;
  currentThemeId: string;
  onSelectTheme: (themeId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  showFavoritesOnly: boolean;
  onToggleFavorites: () => void;
  onExport: () => void;
  onImport: (e: ChangeEvent<HTMLInputElement>) => void;
  onRestoreFromArchive?: () => void;
  onRestoreFromLocalArchive?: () => void;
  onClearAllData?: (options?: { deleteCloudBackup?: boolean }) => void;
  onConnectDrive?: () => void;
  onManualSync?: () => void;
  onDisconnectDrive?: () => void;
  onLogoutAndWipe?: () => void;
  driveConnected?: boolean;
  isSyncingBackground?: boolean;
  driveStatus?: DriveStatus;
  lastBackupAt?: number | null;
  autoRefreshEnabled?: boolean;
  onToggleAutoRefresh?: (enabled: boolean) => void;
  currentUser?: any;
  hasPassword?: boolean;
  onSetPassword?: (pwd: string | null) => Promise<void>;
  systemLockId?: string | null;
  onUpdateSystemLock?: (id: string | null) => void;
  notificationsEnabled?: boolean;
  notificationTime?: string;
  onUpdateNotifications?: (enabled: boolean, time: string) => void;
  vaultName?: string | null;
  onSelectVault?: () => void;
  onDisconnectVault?: () => void;
  onTestNotification?: () => void;
  showSettings?: boolean;
  onToggleSettings?: (show: boolean) => void;
}

const Sidebar = memo(function Sidebar({
  entries,
  activeEntryId,
  onSelectEntry,
  onNewEntry,
  onDeleteEntry,
  theme,
  currentThemeId,
  onSelectTheme,
  searchQuery,
  onSearchChange,
  selectedTag,
  onSelectTag,
  showFavoritesOnly,
  onToggleFavorites,
  onExport,
  onImport,
  onRestoreFromArchive,
  onRestoreFromLocalArchive,
  onClearAllData,
  onConnectDrive,
  onManualSync,
  onDisconnectDrive,
  onLogoutAndWipe,
  driveConnected,
  isSyncingBackground,
  driveStatus,
  lastBackupAt,
  autoRefreshEnabled,
  onToggleAutoRefresh,
  currentUser,
  hasPassword,
  onSetPassword,
  systemLockId,
  onUpdateSystemLock,
  notificationsEnabled,
  notificationTime,
  onUpdateNotifications,
  vaultName,
  onSelectVault,
  onDisconnectVault,
  onTestNotification,
  showSettings,
  onToggleSettings
}: SidebarProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [localShowSettings, setLocalShowSettings] = useState(false);
  const [showClearConfirmStep, setShowClearConfirmStep] = useState<'none' | 'first' | 'driveChoice' | 'second'>('none');
  const [deleteCloudBackupOption, setDeleteCloudBackupOption] = useState<boolean>(false);
  
  const isSettingsActive = showSettings !== undefined ? showSettings : localShowSettings;
  const setSettingsActive = onToggleSettings !== undefined ? onToggleSettings : setLocalShowSettings;

  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

  const driveMeta = driveStatusMeta(driveStatus ?? 'disconnected', lastBackupAt ?? null);

  // Updates State for Github
  const CURRENT_COMMIT_HASH = "8a2f4da";
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'patching' | 'error'>('idle');
  const [latestCommit, setLatestCommit] = useState<{ sha: string; message: string; date: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleCheckUpdates = async () => {
    setUpdateStatus('checking');
    setErrorMessage('');
    try {
      const response = await fetch('https://api.github.com/repos/ljzh04/opnjrnl/commits/main');
      if (!response.ok) {
        throw new Error('Failed to fetch repository details');
      }
      const data = await response.json();
      const sha = data.sha || '';
      const message = data.commit?.message || 'No description';
      const date = data.commit?.committer?.date || '';
      
      const shortSha = sha.substring(0, 7) || 'latest';
      setLatestCommit({ sha: shortSha, message, date });
      
      const installedSha = localStorage.getItem('patched-commit-sha') || CURRENT_COMMIT_HASH;
      
      if (shortSha === installedSha || sha === installedSha) {
        setUpdateStatus('up-to-date');
      } else {
        setUpdateStatus('available');
      }
    } catch (err: any) {
      console.error(err);
      setUpdateStatus('error');
      setErrorMessage(err.message || 'Check failed. Please verify internet connection.');
    }
  };

  const handleAutoPatch = async () => {
    if (!latestCommit) return;
    setUpdateStatus('patching');
    
    try {
      if ('caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map(key => window.caches.delete(key)));
      }
      
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
        }
      }
      
      localStorage.setItem('patched-commit-sha', latestCommit.sha);
      
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setUpdateStatus('error');
      setErrorMessage("Patch failed: " + (err.message || "Unknown error"));
    }
  };

  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [showPasswordRemove, setShowPasswordRemove] = useState(false);
  const [showDeviceLockRemove, setShowDeviceLockRemove] = useState(false);

  // Fuzzy Search Utility
  const fuzzyMatch = (content: string, query: string) => {
    if (!query) return true;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const target = content.toLowerCase();
    return words.every(word => target.includes(word));
  };

  // Filter entries based on search & active tag
  const filteredEntries = useMemo(() => entries.filter((entry) => {
    const combinedContent = `${entry.title} ${entry.content}`;
    const matchesSearch = fuzzyMatch(combinedContent, searchQuery);
    
    const matchesTag = !selectedTag || entry.tags.includes(selectedTag);
    const matchesFav = !showFavoritesOnly || entry.isFavorite;

    return matchesSearch && matchesTag && matchesFav;
  }), [entries, searchQuery, selectedTag, showFavoritesOnly]);

  const sortedEntries = useMemo(() => [...filteredEntries].sort((a, b) => b.createdAt - a.createdAt), [filteredEntries]);

  // Suggested tags are strictly extracted from user-made entry tags only!
  const displayTags = useMemo(() => Array.from(new Set<string>(entries.flatMap(e => e.tags || [])))
    .map(t => t.trim())
    .filter(Boolean), [entries]);

  const stripHtml = (str: string) => {
    if (!str) return "Start taking records...";
    return str.replace(/<[^>]*>?/gm, "").trim();
  };

  return (
    <div 
      className="w-full h-full flex flex-col overflow-hidden relative transition-colors duration-300 border-r"
      style={{ 
        backgroundColor: theme.background, 
        color: theme.textPrimary,
        borderColor: theme.surfaceBorder
      }}
    >
      {/* Header */}
      <div 
        className="px-6 pt-7 pb-5 shrink-0 transition-all"
        style={{ borderBottom: `1px solid ${theme.surfaceBorder}` }}
      >
        <div className="flex justify-between items-center mb-5 relative">
          <div className="flex flex-col">
            <h1 className="text-xl font-serif font-semibold tracking-tight">
              Chapters
            </h1>
            <p className="text-[10px] uppercase tracking-widest opacity-40 font-mono mt-0.5">
              opnjrnl
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsActive(!isSettingsActive)}
              className="flex items-center justify-center p-2.5 rounded-full opacity-70 hover:opacity-100 transition-all duration-150 bg-black/5 dark:bg-white/5 cursor-pointer interactive-target-44"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Google-style Profile/Account Button & Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                className="w-9 h-9 rounded-full overflow-hidden relative flex items-center justify-center transition-colors duration-200 bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.06] dark:hover:bg-white/[0.06] cursor-pointer interactive-target-44 border border-black/10 dark:border-white/10"
                title="Google Account & Cloud Backup"
                aria-label="Google Account & Cloud Backup"
              >
                {currentUser ? (
                  currentUser.photoURL ? (
                    <img 
                      src={currentUser.photoURL} 
                      referrerPolicy="no-referrer"
                      alt="Profile" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white bg-blue-600">
                      {(currentUser.displayName || currentUser.email || 'G')[0].toUpperCase()}
                    </div>
                  )
                ) : (
                  <User className="w-4 h-4 opacity-60" />
                )}
              </button>

              {/* Status Indicator Dot */}
              {currentUser && (
                <div 
                  className={`absolute -bottom-0.5 -right-0.5 w-[14px] h-[14px] rounded-full border-[2.5px] border-solid z-10 transition-colors duration-300 ${driveMeta.dotColor}`}
                  style={{ borderColor: theme.surface }}
                  title={driveMeta.tooltip}
                />
              )}

              <AnimatePresence>
                {showAccountDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowAccountDropdown(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 top-11 w-[300px] rounded-2xl border p-5 shadow-2xl flex flex-col gap-4 z-50 text-xs"
                      style={{ 
                        backgroundColor: theme.surface, 
                        borderColor: theme.surfaceBorder,
                        color: theme.textPrimary
                      }}
                    >
                      {currentUser ? (
                        <div className="flex flex-col items-center gap-3 text-center pb-1">
                          {currentUser.photoURL ? (
                            <img 
                              src={currentUser.photoURL} 
                              referrerPolicy="no-referrer"
                              alt="Profile Logo" 
                              className="w-[52px] h-[52px] rounded-full object-cover border-2 shadow-sm"
                              style={{ borderColor: theme.surfaceBorder }}
                            />
                          ) : (
                            <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-lg font-bold text-white bg-blue-600 shadow-sm">
                              {(currentUser.displayName || currentUser.email || 'G')[0].toUpperCase()}
                            </div>
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-sm tracking-tight">{currentUser.displayName || 'Google Account'}</span>
                            <span className="opacity-60 text-[11px] font-medium break-all">{currentUser.email}</span>
                          </div>

                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/[0.05] dark:bg-white/[0.05] font-bold text-[10px] tracking-wide uppercase mt-1">
                            {['connecting', 'reconnecting', 'syncing'].includes(driveStatus ?? '') ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <span className={`w-1.5 h-1.5 rounded-full ${driveMeta.dotColor}`}></span>
                            )}
                            {driveMeta.label}
                          </div>

                          <div className="w-full border-t my-2" style={{ borderColor: theme.surfaceBorder }} />

                          {driveConnected ? (
                            <button
                              onClick={() => {
                                setShowAccountDropdown(false);
                                onManualSync?.();
                              }}
                              disabled={isSyncingBackground}
                              className="w-full py-3 px-4 rounded-xl font-bold tracking-wide transition-all bg-blue-600 hover:bg-blue-700 active:scale-95 text-white cursor-pointer shadow-sm text-center flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <RefreshCw className={`w-4 h-4 ${isSyncingBackground ? 'animate-spin' : ''}`} />
                              {isSyncingBackground ? 'Backing up…' : 'Back up now'}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setShowAccountDropdown(false);
                                onConnectDrive?.();
                              }}
                              className="w-full py-3 px-4 rounded-xl font-bold tracking-wide transition-all bg-amber-500 hover:bg-amber-600 active:scale-95 text-white cursor-pointer shadow-sm text-center flex items-center justify-center gap-2"
                            >
                              <RefreshCw className="w-4 h-4" />
                              Reconnect
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setShowAccountDropdown(false);
                              onToggleSettings?.(true);
                            }}
                            className="w-full py-3 px-4 rounded-xl font-bold tracking-wide transition-all bg-black/[0.05] dark:bg-white/[0.05] hover:bg-black/[0.1] dark:hover:bg-white/[0.1] active:scale-95 cursor-pointer shadow-sm text-center"
                          >
                            Manage backup
                          </button>

                          <button
                            onClick={() => {
                              setShowAccountDropdown(false);
                              onDisconnectDrive?.();
                            }}
                            className="w-full py-2.5 px-4 rounded-xl font-bold tracking-wide transition-all text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 cursor-pointer text-center border border-rose-500/20"
                          >
                            Disconnect
                          </button>

                          <button
                            onClick={() => {
                              setShowAccountDropdown(false);
                              onLogoutAndWipe?.();
                            }}
                            className="text-[10px] font-bold tracking-wider uppercase opacity-50 hover:opacity-100 transition-opacity p-1.5 cursor-pointer"
                          >
                            Log out & erase this device
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3.5 text-center py-2">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center border bg-black/[0.02] dark:bg-white/[0.02]" style={{ borderColor: theme.surfaceBorder }}>
                            <User className="w-5 h-5 opacity-40" />
                          </div>
                          <div className="flex flex-col gap-1.5 px-1">
                            <span className="font-bold text-sm tracking-tight">Google Drive Backup</span>
                            <p className="opacity-70 text-[11px] leading-relaxed animate-fade-in">
                              Sign in with Google to automatically back up your entries to your own Drive.
                            </p>
                          </div>
                          
                          <button
                            onClick={() => {
                              setShowAccountDropdown(false);
                              onConnectDrive?.();
                            }}
                            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold tracking-wide transition-all w-full shadow-sm cursor-pointer interactive-target-44 mt-1.5"
                          >
                            <Cloud className="w-4 h-4 shrink-0" />
                            <span>Sign in with Google</span>
                          </button>
                        </div>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex items-center mb-4 font-sans">
          <Search 
            className="absolute left-3.5 w-4 h-4 pointer-events-none opacity-40" 
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search notes..."
            className="w-full py-3 pl-10 pr-9 text-sm rounded-xl transition-all duration-150 border interactive-target-44 !outline-none !shadow-none focus:!outline-none focus:!ring-0 focus:!shadow-none focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!shadow-none"
            style={{ 
              backgroundColor: theme.surface, 
              color: theme.textPrimary,
              borderColor: theme.surfaceBorder
            }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 p-2.5 rounded-full hover:bg-black/10 dark:hover:bg-white/20 cursor-pointer"
            >
              <X className="w-4 h-4 opacity-60" />
            </button>
          )}
        </div>

        {/* Quick actions without unneeded Tools */}
        <div className="flex justify-between items-center text-[11px] font-sans">
          <button
            onClick={onToggleFavorites}
            className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-all font-medium py-3 px-2 -ml-2 cursor-pointer interactive-target-44"
          >
            <Heart className={`w-4 h-4 ${showFavoritesOnly ? 'fill-current text-rose-500' : ''}`} />
            <span>{showFavoritesOnly ? 'Showing starred' : 'Filter starred'}</span>
          </button>
        </div>
      </div>

      {/* Settings Overlay Slide-in */}
      <AnimatePresence>
        {isSettingsActive && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 flex flex-col font-sans border-r"
            style={{ 
              backgroundColor: theme.background,
              color: theme.textPrimary,
              borderColor: theme.surfaceBorder
            }}
          >
            {/* Header */}
            <div className="flex items-center px-6 py-6 border-b shrink-0" style={{ borderColor: theme.surfaceBorder }}>
              <button 
                onClick={() => setSettingsActive(false)}
                className="w-11 h-11 flex items-center justify-center -ml-3.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer interactive-target-44"
                aria-label="Back to main drawer"
              >
                <ChevronLeft className="w-5 h-5 opacity-60" />
              </button>
              <h2 className="ml-2 font-serif text-xl tracking-tight">Settings</h2>
            </div>

            {/* Scroll Area */}
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-8 touch-pan-y">
              
              {/* Theme Settings */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold tracking-widest uppercase opacity-40">Appearance</span>
                <div 
                  className="rounded-xl border p-4 flex items-center justify-between shadow-sm text-xs"
                  style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.surface }}
                >
                   <span className="font-semibold tracking-wide">Interface theme</span>
                   <div className="flex items-center gap-3">
                    {[
                      { id: 'paper', hex: '#FAF9F6', name: 'Paper' },
                      { id: 'cream', hex: '#F7F3EA', name: 'Cream' },
                      { id: 'charcoal', hex: '#0D0D0E', name: 'Charcoal' }
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onSelectTheme(t.id)}
                        className="w-11 h-11 rounded-full cursor-pointer relative transition-all flex items-center justify-center border hover:scale-105 active:scale-95 interactive-target-44"
                        style={{ 
                          backgroundColor: t.hex,
                          borderColor: currentThemeId === t.id ? theme.accent : 'rgba(0,0,0,0.1)',
                          boxShadow: currentThemeId === t.id ? '0 0 0 2px rgba(100,100,100,0.1)' : 'none'
                        }}
                        title={t.name}
                        aria-label={`Select ${t.name} theme`}
                      >
                        {currentThemeId === t.id && (
                          <span 
                            className="w-2.5 h-2.5 rounded-full" 
                            style={{ backgroundColor: t.id === 'charcoal' ? '#FFFFFF' : '#000000' }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* App Lock */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold tracking-widest uppercase opacity-40">Privacy</span>
                <div 
                  className="rounded-xl border p-4 flex flex-col gap-5 text-xs"
                  style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.surface }}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold tracking-wide">Device screen lock</span>
                      {!systemLockId && (
                        <button
                          className="px-4 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg opacity-85 hover:opacity-100 transition-colors cursor-pointer interactive-target-44 flex items-center justify-center font-medium"
                          onClick={async () => {
                            const newId = await registerDeviceLock();
                            if (newId) onUpdateSystemLock?.(newId);
                          }}
                        >
                          Enable
                        </button>
                      )}
                      {systemLockId && !showDeviceLockRemove && (
                        <button
                          className="px-4 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg opacity-85 hover:opacity-100 transition-colors cursor-pointer interactive-target-44 flex items-center justify-center font-medium"
                          onClick={() => setShowDeviceLockRemove(true)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {showDeviceLockRemove && (
                      <div className="flex flex-col gap-2 mt-2 pt-2 border-t" style={{ borderColor: theme.surfaceBorder }}>
                        <p className="opacity-80">Remove device lock?</p>
                        <div className="flex justify-end gap-2 mt-1">
                          <button onClick={() => setShowDeviceLockRemove(false)} className="px-4 py-2.5 opacity-60 cursor-pointer interactive-target-44 font-medium">Cancel</button>
                          <button onClick={() => { onUpdateSystemLock?.(null); setShowDeviceLockRemove(false); }} className="px-4 py-2.5 rounded bg-rose-500 text-white font-medium shadow-sm transition-all active:scale-95 cursor-pointer interactive-target-44">Remove</button>
                        </div>
                      </div>
                    )}
                    {systemLockId && !showDeviceLockRemove && (
                      <div className="flex justify-between items-center text-[11px] mt-1">
                        <span className="opacity-60">Status</span>
                        <span className="text-emerald-500 font-medium font-sans">Protected (Biometrics/PIN)</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t" style={{ borderColor: theme.surfaceBorder }}></div>

                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold tracking-wide">Journal password</span>
                      {!hasPassword && !showPasswordSetup && (
                        <button
                          className="px-4 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg opacity-85 hover:opacity-100 transition-colors cursor-pointer interactive-target-44 flex items-center justify-center font-medium"
                          onClick={() => setShowPasswordSetup(true)}
                        >
                          Set password
                        </button>
                      )}
                      {hasPassword && !showPasswordRemove && (
                        <button
                          className="px-4 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg opacity-85 hover:opacity-100 transition-colors cursor-pointer interactive-target-44 flex items-center justify-center font-medium"
                          onClick={() => setShowPasswordRemove(true)}
                        >
                          Remove password
                        </button>
                      )}
                    </div>

                    {showPasswordSetup && (
                      <form 
                        className="flex flex-col gap-2.5 mt-2.5 pt-2.5 border-t"
                        style={{ borderColor: theme.surfaceBorder }}
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const val = (e.currentTarget.elements.namedItem('newpwd') as HTMLInputElement).value;
                          if (val) {
                            await onSetPassword?.(val);
                            setShowPasswordSetup(false);
                          }
                        }}
                      >
                        <input 
                          type="password"
                          name="newpwd"
                          placeholder="Enter new password"
                          autoFocus
                          className="px-3.5 py-3 rounded-xl border bg-transparent outline-none interactive-target-44 w-full"
                          style={{ borderColor: theme.surfaceBorder }}
                        />
                        <div className="flex justify-end gap-2 mt-1">
                          <button type="button" onClick={() => setShowPasswordSetup(false)} className="px-4 py-2.5 opacity-60 cursor-pointer interactive-target-44 font-medium">Cancel</button>
                          <button type="submit" className="px-4 py-2.5 rounded text-white font-medium shadow-sm transition-all active:scale-95 cursor-pointer interactive-target-44" style={{ backgroundColor: theme.accent }}>Save</button>
                        </div>
                      </form>
                    )}

                    {showPasswordRemove && (
                      <div className="flex flex-col gap-2 mt-2 pt-2 border-t" style={{ borderColor: theme.surfaceBorder }}>
                        <p className="opacity-80">Are you sure you want to remove the password?</p>
                        <p className="opacity-60 text-[10px]">Entries will be stored without encryption.</p>
                        <div className="flex justify-end gap-2 mt-1">
                          <button onClick={() => setShowPasswordRemove(false)} className="px-3 py-1.5 opacity-60 cursor-pointer">Cancel</button>
                          <button onClick={async () => { await onSetPassword?.(null); setShowPasswordRemove(false); }} className="px-3 py-1.5 rounded bg-rose-500 text-white font-medium shadow-sm transition-all active:scale-95 cursor-pointer">Remove</button>
                        </div>
                      </div>
                    )}

                    {hasPassword && !showPasswordRemove && (
                      <div className="flex justify-between items-center mt-1">
                        <span className="opacity-60">Status</span>
                        <span className="text-emerald-500 font-medium font-sans">Protected (Encrypted)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

                {/* Push Notifications */}
               <div className="flex flex-col gap-3">
                 <span className="text-[10px] font-bold tracking-widest uppercase opacity-40">Reminders</span>
                 <div 
                   className="rounded-xl border p-4 flex flex-col gap-4 text-xs"
                   style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.surface }}
                 >
                   <label className="flex justify-between items-center cursor-pointer interactive-target-44 py-1">
                     <span className="font-semibold tracking-wide">Daily reminder</span>
                     <input 
                       type="checkbox"
                       checked={!!notificationsEnabled}
                       onChange={(e) => onUpdateNotifications?.(e.target.checked, notificationTime || "20:00")}
                       className="w-5 h-5 cursor-pointer accent-current" 
                       style={{ accentColor: theme.accent }}
                     />
                   </label>
                   
                   {notificationsEnabled && (
                     <>
                     <div className="flex justify-between items-center opacity-80 pt-2 border-t" style={{ borderColor: theme.surfaceBorder }}>
                       <span>Reminder time</span>
                       <input 
                         type="time" 
                         value={notificationTime || "20:00"}
                         onChange={(e) => onUpdateNotifications?.(true, e.target.value)}
                         className="bg-transparent border rounded px-2.5 py-1.5 outline-none text-xs"
                         style={{ borderColor: theme.surfaceBorder }}
                       />
                     </div>
                     <button
                       type="button"
                       onClick={onTestNotification}
                       className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold uppercase tracking-wider text-center transition-all bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] active:scale-95 cursor-pointer interactive-target-44 flex items-center justify-center border"
                       style={{ borderColor: theme.surfaceBorder, color: theme.textPrimary }}
                     >
                       Send test reminder
                     </button>
                   </>
                   )}
                 </div>
               </div>
 
               {/* Danger Zone */}
               <div className="flex flex-col gap-3">
                 <span className="text-[10px] font-bold tracking-widest uppercase opacity-40 text-rose-500">Danger zone</span>
                 <div 
                   className="rounded-xl border p-4 flex flex-col gap-3.5 text-xs border-rose-500/15"
                   style={{ backgroundColor: theme.surface }}
                 >
                   <div className="flex flex-col gap-1 text-left">
                    <span className="font-semibold tracking-wide text-[13px] text-rose-500">Clear all journal data</span>
                    <p className="opacity-70 text-[11px] leading-relaxed">
                      Delete all entries and preferences on this device. Export a backup first if you want to keep your records.
                     </p>
                   </div>
                   <button
                     onClick={() => {
                       setDeleteCloudBackupOption(false);
                       if (driveConnected) {
                         setShowClearConfirmStep('driveChoice');
                       } else {
                         setShowClearConfirmStep('first');
                       }
                     }}
                     className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold uppercase tracking-wider text-center transition-all bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 active:scale-[0.98] cursor-pointer interactive-target-44 flex items-center justify-center border border-rose-500/20 font-bold font-sans"
                   >
                     Clear all data
                   </button>
                 </div>
               </div>

{/* Data Import/Export & Restore */}
                <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-bold tracking-widest uppercase opacity-40">Local data</span>
                  <div 
                    className="rounded-xl border flex flex-col sm:flex-row shadow-sm overflow-hidden text-xs"
                    style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.surface }}
                  >
                    <button
                      onClick={onExport}
                      className="flex-1 flex flex-col items-center justify-center gap-2 py-5 px-3 hover:bg-black/5 dark:hover:bg-white/5 border-b sm:border-b-0 sm:border-r cursor-pointer interactive-target-44"
                      style={{ borderColor: theme.surfaceBorder }}
                    >
                      <FileDown className="w-5 h-5 opacity-50 mb-1" />
                      <span className="font-semibold tracking-wide">Export</span>
                      <span className="text-[10px] opacity-50 text-center">Save a copy of your journal</span>
                    </button>
                    <label
                      className="flex-1 flex flex-col items-center justify-center gap-2 py-5 px-3 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer interactive-target-44"
                    >
                      <FileUp className="w-5 h-5 opacity-50 mb-1" />
                      <span className="font-semibold tracking-wide">Import</span>
                      <span className="text-[10px] opacity-50 text-center">Restore from a saved copy</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={onImport}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div 
                    className="rounded-xl border flex flex-col sm:flex-row shadow-sm overflow-hidden text-xs"
                    style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.surface }}
                  >
                    {driveConnected && (
                      <button
                        onClick={onRestoreFromArchive}
                        className="flex-1 flex flex-col items-center justify-center gap-2 py-5 px-3 hover:bg-black/5 dark:hover:bg-white/5 border-b sm:border-b-0 sm:border-r cursor-pointer interactive-target-44"
                        style={{ borderColor: theme.surfaceBorder }}
                      >
                        <FileDown className="w-5 h-5 opacity-50 mb-1" />
                        <span className="font-semibold tracking-wide">Drive archive</span>
                        <span className="text-[10px] opacity-50 text-center">Recover previous backup state</span>
                      </button>
                    )}
                    <button
                      onClick={onRestoreFromLocalArchive}
                      className="flex-1 flex flex-col items-center justify-center gap-2 py-5 px-3 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer interactive-target-44"
                      style={{ borderColor: theme.surfaceBorder }}
                    >
                      <FileUp className="w-5 h-5 opacity-50 mb-1" />
                      <span className="font-semibold tracking-wide">Local archive</span>
                      <span className="text-[10px] opacity-50 text-center">Recover entries deleted from this device</span>
                    </button>
                  </div>
                </div>

               {/* Native Vault Directory Settings */}
              <div className="flex flex-col gap-3 mt-4">
                <div className="flex items-center gap-2 mb-1 px-1">
                  <Folder className="w-3.5 h-3.5 opacity-60" />
                  <span className="text-[10px] font-bold tracking-widest uppercase opacity-40">Local Folder</span>
                </div>
                <div 
                  className="rounded-xl border overflow-hidden flex flex-col"
                  style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.surface }}
                >
                  <div className="p-4 flex flex-col gap-2 border-b" style={{ borderColor: theme.surfaceBorder }}>
                    <span className="text-[11px] opacity-70 leading-relaxed">
                      Store your journal directly on your device. This allows you to sync with your own services (like Syncthing or Dropbox) and prevents vendor lock-in.
                    </span>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold">{vaultName ? `Connected: ${vaultName}` : "Not Connected"}</span>
                      </div>
                      {vaultName ? (
                        <button 
                          onClick={onDisconnectVault}
                          className="text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-full bg-rose-500/10 text-rose-500 active:scale-95 transition-transform"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button 
                          onClick={onSelectVault}
                          className="text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-full active:scale-95 transition-transform border"
                          style={{ backgroundColor: theme.accent, color: theme.background, borderColor: theme.surfaceBorder }}
                        >
                          Select Folder
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cloud Backup Settings */}
              <div 
                className="rounded-xl border p-4 flex flex-col gap-3 text-xs" 
                style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.surface }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] opacity-80">
                    <Cloud className="w-3.5 h-3.5 text-blue-500" />
                    <span>Cloud backup</span>
                  </div>
                  {currentUser && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide opacity-80">
                      {['connecting', 'reconnecting', 'syncing'].includes(driveStatus ?? '') ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <span className={`w-1.5 h-1.5 rounded-full ${driveMeta.dotColor}`}></span>
                      )}
                      {driveMeta.label}
                    </span>
                  )}
                </div>

                {currentUser ? (
                  <>
                    <p className="text-[10.5px] opacity-70 leading-relaxed">
                      Encrypted backups of your journal are saved to a hidden folder inside your own Google Drive. The app cannot see, edit, or delete any of your other Drive files.
                    </p>

                    <button
                      onClick={onManualSync}
                      disabled={isSyncingBackground}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold tracking-wide transition-all cursor-pointer interactive-target-44 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBackground ? 'animate-spin' : ''}`} />
                      {isSyncingBackground ? 'Backing up…' : 'Back up now'}
                    </button>

                    <div className="border-t pt-3 flex flex-col gap-2" style={{ borderColor: theme.surfaceBorder }}>
                      <label className="flex justify-between items-center cursor-pointer py-1 select-none">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold tracking-wide">Stay Connected</span>
                          <span className="text-[9.5px] opacity-55 leading-tight">Keep connection alive in background (experimental)</span>
                        </div>
                        <div
                          onClick={() => onToggleAutoRefresh?.(!autoRefreshEnabled)}
                          className={`relative w-10 h-[22px] rounded-full shrink-0 transition-colors duration-200 ${autoRefreshEnabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                        >
                          <div
                            className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ${autoRefreshEnabled ? 'translate-x-[18px]' : ''}`}
                          />
                        </div>
                      </label>

                      <button
                        onClick={onDisconnectDrive}
                        className="w-full py-2.5 px-4 rounded-xl text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 font-bold tracking-wide transition-all cursor-pointer border border-rose-500/20"
                      >
                        Disconnect
                      </button>

                      <button
                        onClick={onLogoutAndWipe}
                        className="w-full py-2 px-4 text-[10px] font-bold uppercase tracking-wider opacity-55 hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        Log out & erase this device
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[10.5px] opacity-70 leading-relaxed">
                      Backups are saved to a hidden folder inside your own Google Drive. The app cannot see, edit, or delete any of your other Drive files.
                    </p>
                    <button
                      onClick={onConnectDrive}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold tracking-wide transition-all cursor-pointer interactive-target-44"
                    >
                      <Cloud className="w-4 h-4 shrink-0" />
                      <span>Connect to Google Drive</span>
                    </button>
                  </>
                )}
              </div>



              
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User-made topics list */}
      {displayTags.length > 0 && (
        <div 
          className="w-full relative shrink-0 border-b text-[11px] font-sans"
          style={{ borderColor: theme.surfaceBorder }}
        >
          {/* Subtle fade edges to indicate scroll */}
          <div className="absolute top-0 bottom-0 left-0 w-6 bg-gradient-to-r pointer-events-none z-10"
               style={{ backgroundImage: `linear-gradient(to right, ${theme.background}, transparent)` }} />
          <div className="absolute top-0 bottom-0 right-0 w-6 bg-gradient-to-l pointer-events-none z-10"
               style={{ backgroundImage: `linear-gradient(to left, ${theme.background}, transparent)` }} />
          
          <div className="w-full overflow-x-auto scrollbar-none flex gap-1.5 px-6 py-3">
            <button
              onClick={() => onSelectTag(null)}
              className="px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-all whitespace-nowrap active:opacity-75 cursor-pointer"
              style={{
                backgroundColor: selectedTag === null ? theme.accent : 'transparent',
                color: selectedTag === null ? theme.surface : theme.textSecondary,
              }}
            >
              All tags
            </button>
            {displayTags.map((tag) => (
              <button
                key={tag}
                onClick={() => onSelectTag(selectedTag === tag ? null : tag)}
                className="px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-all whitespace-nowrap active:opacity-75 cursor-pointer"
                style={{
                  backgroundColor: selectedTag === tag ? theme.accent : 'transparent',
                  color: selectedTag === tag ? theme.surface : theme.textSecondary,
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Entry List */}
      <div className="flex-1 overflow-y-auto pb-24 relative px-3 pt-3 scrollbar-thin">
        {sortedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center h-full">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 opacity-50 border border-current" style={{ color: theme.surfaceBorder }}>
              <Search className="w-5 h-5" style={{ color: theme.textSecondary }} />
            </div>
            {entries.length === 0 ? (
              <>
                <p className="font-serif text-lg font-medium tracking-tight mb-1" style={{ color: theme.textPrimary }}>Tabula rasa</p>
                <p className="font-sans text-xs opacity-60 leading-relaxed max-w-[200px]" style={{ color: theme.textSecondary }}>
                  Your canvas is blank. Create a new journal entry to begin.
                </p>
              </>
            ) : (
              <>
                <p className="font-serif text-lg font-medium tracking-tight mb-1" style={{ color: theme.textPrimary }}>No matches</p>
                <p className="font-sans text-xs opacity-60 leading-relaxed max-w-[200px]" style={{ color: theme.textSecondary }}>
                  Adjust your search or clear selected tags.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {sortedEntries.map((entry) => {
                const isActive = activeEntryId === entry.id;
                const isDeleting = confirmDeleteId === entry.id;
                
                return (
                  <motion.div
                    key={entry.id}
                    layoutId={`card-${entry.id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="relative group rounded-xl overflow-hidden"
                  >
                    <div
                      onClick={() => {
                        if (!isDeleting) {
                          onSelectEntry(entry.id);
                        }
                      }}
                      className="w-full text-left p-4.5 cursor-pointer rounded-xl relative border animate-pop-ease hover:-translate-y-0.5 hover:shadow-xs active:scale-[0.99]"
                      style={{
                        backgroundColor: isActive ? theme.accentLight : 'transparent',
                        borderColor: isActive ? theme.surfaceBorder : 'transparent',
                      }}
                    >
                      <div className="relative z-10 pr-2">
                        {/* Title & Star inline */}
                        <div className="flex justify-between items-start gap-2 mb-1 pr-6">
                          <div className="flex items-center gap-2 overflow-hidden">
                            {entry.mood && MOOD_ICONS[entry.mood] && (
                              <span className="flex items-center justify-center text-current opacity-70 shrink-0">
                                {MOOD_ICONS[entry.mood]}
                              </span>
                            )}
                            <h3 
                              className={`font-serif text-sm font-semibold tracking-tight truncate ${
                                !entry.title ? 'italic opacity-30 font-medium' : ''
                              }`}
                              style={{ color: theme.textPrimary }}
                            >
                              {entry.title || 'Untitled'}
                            </h3>
                          </div>
                        </div>

                        {/* Content Snip */}
                        <p 
                          className="text-xs line-clamp-2 leading-relaxed opacity-70 font-sans mb-3 pr-2.5"
                          style={{ color: theme.textSecondary }}
                        >
                          {stripHtml(entry.content)}
                        </p>

                        {/* Metadata block OR Interactive Delete Confirmation */}
                        {isDeleting ? (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center gap-2 bg-rose-50 dark:bg-rose-500/10 px-3 py-1.5 rounded-full text-xs select-none shadow-sm mt-2"
                          >
                            <span className="text-rose-600 dark:text-rose-400 font-semibold text-[9px] uppercase tracking-widest mr-1 flex-1">Delete?</span>
                            <div className="flex gap-1.5 relative z-20">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteEntry(entry.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 text-[9px] uppercase tracking-widest bg-rose-500 active:bg-rose-600 active:scale-95 text-white rounded-full font-bold cursor-pointer transition-all shadow-sm"
                              >
                                Yes
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 text-[9px] uppercase tracking-widest bg-black/5 dark:bg-white/5 active:bg-black/10 dark:active:bg-white/10 rounded-full font-bold cursor-pointer transition-all active:scale-95"
                                style={{ color: theme.textPrimary }}
                              >
                                No
                              </button>
                            </div>
                          </motion.div>
                        ) : (
                          <div className="flex items-center justify-between text-[10px] font-mono tracking-wider uppercase opacity-45 mr-6">
                            <span>
                              {format(entry.createdAt, 'MMM dd, yyyy')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right-aligned icon column for Favorite / Delete (same x-position) */}
                    {!isDeleting && (
                      <div className="absolute right-3.5 top-0 bottom-0 py-4.5 flex flex-col justify-between items-center z-20 pointer-events-none">
                        {entry.isFavorite ? (
                          <Heart className="w-3.5 h-3.5 text-rose-500 fill-current mt-0.5" />
                        ) : <div />}
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(entry.id);
                          }}
                          className="p-2 -mr-2 -mb-2 text-zinc-400 active:text-rose-500 opacity-60 active:opacity-100 transition-all duration-150 rounded cursor-pointer pointer-events-auto"
                          aria-label="Delete page"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Clear All Confirmation Dialog Step 1 */}
      <AnimatePresence>
        {showClearConfirmStep === 'first' && (
          <div className="absolute inset-0 bg-black/40 dark:bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 cursor-default" 
              onClick={() => setShowClearConfirmStep('none')}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="w-full max-w-[280px] rounded-[24px] p-6 shadow-2xl border flex flex-col gap-4.5 font-sans relative z-[110] text-left"
              style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder, color: theme.textPrimary }}
            >
              <div className="flex gap-3.5 items-start">
                <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-rose-500/10 text-rose-500">
                  <Trash2 className="w-4.5 h-4.5" />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <h3 className="text-sm font-bold tracking-tight">Clear all data?</h3>
                  <p className="opacity-70 text-[10.5px] leading-relaxed">
                    This will delete all entries on this device. Ready to proceed?
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-1">
                <button
                  onClick={() => setShowClearConfirmStep('second')}
                  className="w-full py-2.5 px-4 rounded-xl text-center font-bold tracking-tight transition-all bg-rose-500 hover:bg-rose-600 text-white cursor-pointer shadow-sm text-xs font-bold"
                >
                  Yes, continue &rarr;
                </button>
                <button
                  onClick={() => setShowClearConfirmStep('none')}
                  className="w-full py-2.5 px-4 rounded-xl text-center font-bold tracking-tight transition-all hover:bg-black/[0.04] dark:hover:bg-white/[0.04] cursor-pointer text-xs border"
                  style={{ borderColor: theme.surfaceBorder, color: theme.textPrimary }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cloud Sync Clear Option Choice Screen */}
      <AnimatePresence>
        {showClearConfirmStep === 'driveChoice' && (
          <div className="absolute inset-0 bg-black/50 dark:bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 cursor-default" 
              onClick={() => setShowClearConfirmStep('none')}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="w-full max-w-[325px] rounded-[24px] p-5 shadow-2xl border flex flex-col gap-4 font-sans relative z-[110] text-left"
              style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder, color: theme.textPrimary }}
            >
              <div className="flex gap-3 items-center">
                <div className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-500">
                  <Cloud className="w-4 h-4" />
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider opacity-60">Drive Backup Safety</h3>
                  <p className="font-bold text-[13px] leading-none">Choose what to delete</p>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed opacity-75">
                  Your device is linked to a Drive backup. Choose how to handle it:
              </p>

              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => {
                    setDeleteCloudBackupOption(false);
                    setShowClearConfirmStep('second');
                  }}
                  className="w-full text-left p-3.5 rounded-2xl border transition-all hover:translate-y-[-2px] hover:shadow-md cursor-pointer flex gap-3 items-start select-none active:scale-[0.98]"
                  style={{ 
                    backgroundColor: theme.surface, 
                    borderColor: 'rgba(59, 130, 246, 0.35)',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.05)'
                  }}
                >
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-blue-500/10 text-blue-500 mt-0.5">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-bold tracking-tight">1. Keep Drive Backup</span>
                    <p className="opacity-65 text-[10px] leading-normal font-normal">
                      Clears entries on this device only. Your Drive backup stays safe.
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setDeleteCloudBackupOption(true);
                    setShowClearConfirmStep('second');
                  }}
                  className="w-full text-left p-3.5 rounded-2xl border transition-all hover:translate-y-[-2px] hover:shadow-md cursor-pointer flex gap-3 items-start select-none active:scale-[0.98]"
                  style={{ 
                    backgroundColor: theme.surface, 
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.05)'
                  }}
                >
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-rose-500/10 text-rose-500 mt-0.5">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-bold tracking-tight text-rose-500">2. Wipe Device + Drive Backup</span>
                    <p className="opacity-65 text-[10px] leading-normal font-normal">
                      Permanently deletes entries on this device AND your Drive backup.
                    </p>
                  </div>
                </button>
              </div>

              <div className="flex gap-2 justify-end mt-1 border-t pt-3" style={{ borderColor: theme.surfaceBorder }}>
                <button
                  onClick={() => setShowClearConfirmStep('none')}
                  className="px-4 py-2 rounded-xl text-center transition-all hover:bg-black/[0.04] dark:hover:bg-white/[0.04] cursor-pointer text-xs"
                  style={{ color: theme.textPrimary }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear All Confirmation Dialog Step 2 */}
      <AnimatePresence>
        {showClearConfirmStep === 'second' && (
          <div className="absolute inset-0 bg-black/60 dark:bg-black/95 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 cursor-default" 
              onClick={() => setShowClearConfirmStep('none')}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="w-full max-w-[315px] rounded-[24px] p-6 shadow-2xl border flex flex-col gap-4.5 font-sans relative z-[120] text-left"
              style={{ backgroundColor: theme.surface, borderColor: deleteCloudBackupOption ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.4)', color: theme.textPrimary }}
            >
              <div className="flex gap-3.5 items-start">
                <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-white ${deleteCloudBackupOption ? 'bg-rose-500' : 'bg-blue-500'}`}>
                  {deleteCloudBackupOption ? <AlertTriangle className="w-5 h-5 animate-pulse" /> : <X className="w-5 h-5" />}
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <h3 className={`text-sm font-bold tracking-tight ${deleteCloudBackupOption ? 'text-rose-500' : 'text-blue-500'}`}>
                    {deleteCloudBackupOption ? 'Delete everything?' : 'Delete local data?'}
                  </h3>
                  <p className="opacity-75 text-[10.5px] leading-relaxed">
                    {deleteCloudBackupOption ? (
                      "This cannot be undone. All entries on this device AND your Drive backup will be deleted. Are you sure?"
                    ) : (
                      "This will delete all entries and settings on this device. Your Drive backup is not affected. Ready?"
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-1">
                <button
                  onClick={() => {
                    onClearAllData?.({ deleteCloudBackup: deleteCloudBackupOption });
                    setShowClearConfirmStep('none');
                    setSettingsActive(false);
                  }}
                  className={`w-full py-2.5 px-4 rounded-xl text-center font-bold tracking-tight transition-all text-white cursor-pointer shadow-sm text-xs ${deleteCloudBackupOption ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  I am certain, write changes
                </button>
                <button
                  onClick={() => setShowClearConfirmStep('none')}
                  className="w-full py-2.5 px-4 rounded-xl text-center font-bold tracking-tight transition-all hover:bg-black/[0.04] dark:hover:bg-white/[0.04] cursor-pointer text-xs border"
                  style={{ borderColor: theme.surfaceBorder, color: theme.textPrimary }}
                >
                  Abort and exit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Privacy Link */}
      <div className="absolute bottom-7 left-6 z-35 flex flex-col gap-1 text-[10px] font-sans font-medium opacity-40 hover:opacity-100 transition-opacity" style={{ color: theme.textSecondary }}>
        <a href="privacy.html" target="_blank" rel="noopener noreferrer" className="hover:underline uppercase tracking-widest">
          Privacy Policy
        </a>
      </div>

      {/* Floating Action Button */}
      <motion.button 
        onClick={onNewEntry}
        whileTap={{ scale: 0.95 }}
        className="absolute bottom-6 right-6 flex items-center justify-center gap-2 h-14 px-6 rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.15)] active:shadow-md transition-all cursor-pointer z-35"
        style={{ 
          backgroundColor: theme.accent, 
          color: theme.surface,
        }}
        aria-label="Log new note"
      >
        <Plus className="w-4 h-4" />
        <span className="font-sans font-medium text-xs tracking-wider uppercase">
          New note
        </span>
      </motion.button>
    </div>
  );
});

export default Sidebar;
