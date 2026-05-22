import { JournalEntry, MinimalTheme } from '../types';
import { format } from 'date-fns';
import { MOOD_SCALE } from '../themeData';
import { registerDeviceLock } from '../lib/webauthn';
import { 
  Plus, 
  Search, 
  Heart, 
  Trash2, 
  X,
  Settings,
  FileDown,
  FileUp,
  Smile,
  Meh,
  Frown,
  CloudRain,
  Sun,
  ChevronLeft,
  Cloud,
  RefreshCw
} from 'lucide-react';
import { useState, ChangeEvent, ReactNode } from 'react';
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
  onConnectDrive?: () => void;
  driveConnected?: boolean;
  appPassword?: string | null;
  onUpdateAppPassword?: (pwd: string | null) => void;
  systemLockId?: string | null;
  onUpdateSystemLock?: (id: string | null) => void;
  notificationsEnabled?: boolean;
  notificationTime?: string;
  onUpdateNotifications?: (enabled: boolean, time: string) => void;
  showSettings?: boolean;
  onToggleSettings?: (show: boolean) => void;
}

export default function Sidebar({
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
  onConnectDrive,
  driveConnected,
  appPassword,
  onUpdateAppPassword,
  systemLockId,
  onUpdateSystemLock,
  notificationsEnabled,
  notificationTime,
  onUpdateNotifications,
  showSettings,
  onToggleSettings
}: SidebarProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [localShowSettings, setLocalShowSettings] = useState(false);
  
  const isSettingsActive = showSettings !== undefined ? showSettings : localShowSettings;
  const setSettingsActive = onToggleSettings !== undefined ? onToggleSettings : setLocalShowSettings;

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
  const filteredEntries = entries.filter((entry) => {
    const combinedContent = `${entry.title} ${entry.content}`;
    const matchesSearch = fuzzyMatch(combinedContent, searchQuery);
    
    const matchesTag = !selectedTag || entry.tags.includes(selectedTag);
    const matchesFav = !showFavoritesOnly || entry.isFavorite;

    return matchesSearch && matchesTag && matchesFav;
  });

  const sortedEntries = [...filteredEntries].sort((a, b) => b.createdAt - a.createdAt);

  // Suggested tags are strictly extracted from user-made entry tags only!
  const displayTags = Array.from(new Set(entries.flatMap(e => e.tags || [])))
    .map(t => t.trim())
    .filter(Boolean);

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
        <div className="flex justify-between items-center mb-5">
          <div className="flex flex-col">
            <h1 className="text-xl font-serif font-semibold tracking-tight">
              Chapters
            </h1>
            <p className="text-[10px] uppercase tracking-widest opacity-40 font-mono mt-0.5">
              opnjrnl
            </p>
          </div>

          <button
            onClick={() => setSettingsActive(!isSettingsActive)}
            className="flex items-center justify-center p-2 rounded-full opacity-70 active:opacity-100 transition-all bg-black/5 dark:bg-white/5"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
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
            className="w-full py-2 pl-10 pr-9 text-xs rounded-lg transition-all outline-none border focus:border-zinc-400"
            style={{ 
              backgroundColor: theme.surface, 
              color: theme.textPrimary,
              borderColor: theme.surfaceBorder
            }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 p-2 rounded-full active:bg-black/10 dark:active:bg-white/20"
            >
              <X className="w-4 h-4 opacity-60" />
            </button>
          )}
        </div>

        {/* Quick actions without unneeded Tools */}
        <div className="flex justify-between items-center text-[11px] font-sans">
          <button
            onClick={onToggleFavorites}
            className="flex items-center gap-2 opacity-70 active:opacity-100 transition-all font-medium py-3 px-2 -ml-2"
          >
            <Heart className={`w-4 h-4 ${showFavoritesOnly ? 'fill-current text-rose-500' : ''}`} />
            <span>{showFavoritesOnly ? 'Showing Starred' : 'Filter Starred'}</span>
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
                className="w-8 h-8 flex items-center justify-center -ml-2 rounded-full active:bg-black/5 dark:active:bg-white/5 transition-colors"
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
                   <span className="font-semibold tracking-wide">Interface Theme</span>
                   <div className="flex items-center gap-3">
                    {[
                      { id: 'paper', hex: '#FAF9F6', name: 'Paper' },
                      { id: 'cream', hex: '#F7F3EA', name: 'Cream' },
                      { id: 'charcoal', hex: '#0D0D0E', name: 'Charcoal' }
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onSelectTheme(t.id)}
                        className={`w-9 h-9 rounded-full cursor-pointer relative transition-all flex items-center justify-center border active:scale-95`}
                        style={{ 
                          backgroundColor: t.hex,
                          borderColor: currentThemeId === t.id ? theme.accent : 'rgba(0,0,0,0.1)',
                          boxShadow: currentThemeId === t.id ? '0 0 0 2px rgba(100,100,100,0.1)' : 'none'
                        }}
                        title={t.name}
                      >
                        {currentThemeId === t.id && (
                          <span 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: t.id === 'charcoal' ? '#FFFFFF' : '#000000' }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Account / Sync */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold tracking-widest uppercase opacity-40">Cloud Sync</span>
                <div 
                  className="rounded-xl border p-4 flex flex-col gap-4 text-xs"
                  style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.surface }}
                >
                  <div className="opacity-70 leading-relaxed font-medium">
                    Connect to your Google Drive to back up your journal entries automatically and securely.
                  </div>
                  <button onClick={onConnectDrive} className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-blue-600 active:bg-blue-700 text-white font-semibold tracking-wide transition-all w-full shadow-sm">
                    <Cloud className="w-4 h-4" />
                    <span>{driveConnected ? 'Syncing to Drive (Connected)' : 'Connect Google Drive'}</span>
                  </button>
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
                      <span className="font-semibold tracking-wide">Device Screen Lock</span>
                      {!systemLockId && (
                        <button
                          className="px-3 py-1 bg-black/5 dark:bg-white/5 active:bg-black/10 dark:active:bg-white/10 rounded-lg opacity-80 active:opacity-100 transition-colors"
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
                          className="px-3 py-1 bg-black/5 dark:bg-white/5 active:bg-black/10 dark:active:bg-white/10 rounded-lg opacity-80 active:opacity-100 transition-colors"
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
                          <button onClick={() => setShowDeviceLockRemove(false)} className="px-3 py-1.5 opacity-60">Cancel</button>
                          <button onClick={() => { onUpdateSystemLock?.(null); setShowDeviceLockRemove(false); }} className="px-3 py-1.5 rounded bg-rose-500 text-white font-medium shadow-sm transition-all active:scale-95">Remove</button>
                        </div>
                      </div>
                    )}
                    {systemLockId && !showDeviceLockRemove && (
                      <div className="flex justify-between items-center">
                        <span className="opacity-60">Status</span>
                        <span className="text-emerald-500 font-medium">Protected (Biometrics/PIN)</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t" style={{ borderColor: theme.surfaceBorder }}></div>

                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold tracking-wide">Journal Password</span>
                      {!appPassword && !showPasswordSetup && (
                        <button
                          className="px-3 py-1 bg-black/5 dark:bg-white/5 active:bg-black/10 dark:active:bg-white/10 rounded-lg opacity-80 active:opacity-100 transition-colors"
                          onClick={() => setShowPasswordSetup(true)}
                        >
                          Set Password
                        </button>
                      )}
                      {appPassword && !showPasswordRemove && (
                        <button
                          className="px-3 py-1 bg-black/5 dark:bg-white/5 active:bg-black/10 dark:active:bg-white/10 rounded-lg opacity-80 active:opacity-100 transition-colors"
                          onClick={() => setShowPasswordRemove(true)}
                        >
                          Remove Password
                        </button>
                      )}
                    </div>
                    
                    {showPasswordSetup && (
                      <form 
                        className="flex flex-col gap-2 mt-2 pt-2 border-t"
                        style={{ borderColor: theme.surfaceBorder }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const val = (e.currentTarget.elements.namedItem('newpwd') as HTMLInputElement).value;
                          if (val) {
                            onUpdateAppPassword?.(val);
                            setShowPasswordSetup(false);
                          }
                        }}
                      >
                        <input 
                          type="password"
                          name="newpwd"
                          placeholder="Enter new password"
                          autoFocus
                          className="px-3 py-2 rounded border bg-transparent outline-none"
                          style={{ borderColor: theme.surfaceBorder }}
                        />
                        <div className="flex justify-end gap-2 mt-1">
                          <button type="button" onClick={() => setShowPasswordSetup(false)} className="px-3 py-1.5 opacity-60">Cancel</button>
                          <button type="submit" className="px-3 py-1.5 rounded text-white font-medium shadow-sm transition-all active:scale-95" style={{ backgroundColor: theme.accent }}>Save</button>
                        </div>
                      </form>
                    )}

                    {showPasswordRemove && (
                      <div className="flex flex-col gap-2 mt-2 pt-2 border-t" style={{ borderColor: theme.surfaceBorder }}>
                        <p className="opacity-80">Are you sure you want to remove the password?</p>
                        <div className="flex justify-end gap-2 mt-1">
                          <button onClick={() => setShowPasswordRemove(false)} className="px-3 py-1.5 opacity-60">Cancel</button>
                          <button onClick={() => { onUpdateAppPassword?.(null); setShowPasswordRemove(false); }} className="px-3 py-1.5 rounded bg-rose-500 text-white font-medium shadow-sm transition-all active:scale-95">Remove</button>
                        </div>
                      </div>
                    )}

                    {appPassword && !showPasswordRemove && (
                      <div className="flex justify-between items-center mt-1">
                        <span className="opacity-60">Status</span>
                        <span className="text-emerald-500 font-medium">Protected (Custom Password)</span>
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
                  <label className="flex justify-between items-center cursor-pointer">
                    <span className="font-semibold tracking-wide">Daily Reminder</span>
                    <input 
                      type="checkbox"
                      checked={!!notificationsEnabled}
                      onChange={(e) => onUpdateNotifications?.(e.target.checked, notificationTime || "20:00")}
                      className="w-4 h-4 cursor-pointer accent-current" 
                      style={{ accentColor: theme.accent }}
                    />
                  </label>
                  
                  {notificationsEnabled && (
                    <div className="flex justify-between items-center opacity-80 pt-2 border-t" style={{ borderColor: theme.surfaceBorder }}>
                      <span>Reminder Time</span>
                      <input 
                        type="time" 
                        value={notificationTime || "20:00"}
                        onChange={(e) => onUpdateNotifications?.(true, e.target.value)}
                        className="bg-transparent border rounded px-2 py-1 outline-none text-xs"
                        style={{ borderColor: theme.surfaceBorder }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Data Import/Export */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold tracking-widest uppercase opacity-40">Local Data</span>
                <div 
                  className="rounded-xl border flex flex-col sm:flex-row shadow-sm overflow-hidden text-xs"
                  style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.surface }}
                >
                  <button
                    onClick={onExport}
                    className="flex-1 flex flex-col items-center justify-center gap-2 py-5 px-3 transition-colors active:bg-black/5 dark:active:bg-white/5 border-b sm:border-b-0 sm:border-r"
                    style={{ borderColor: theme.surfaceBorder }}
                  >
                    <FileDown className="w-5 h-5 opacity-50 mb-1" />
                    <span className="font-semibold tracking-wide">Export Backup</span>
                    <span className="text-[10px] opacity-50 text-center">Save a .json copy</span>
                  </button>
                  
                  <label
                    className="flex-1 flex flex-col items-center justify-center gap-2 py-5 px-3 transition-colors active:bg-black/5 dark:active:bg-white/5 cursor-pointer"
                  >
                    <FileUp className="w-5 h-5 opacity-50 mb-1" />
                    <span className="font-semibold tracking-wide">Import Data</span>
                    <span className="text-[10px] opacity-50 text-center">Restore from .json</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={onImport}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* App Version & In-App Updates */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold tracking-widest uppercase opacity-40">System Updates</span>
                <div 
                  className="rounded-xl border p-4 flex flex-col gap-4 text-xs"
                  style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.surface }}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold tracking-wide">Version Status</span>
                      <span className="text-[10px] opacity-50 font-mono uppercase">
                        Current: {localStorage.getItem('patched-commit-sha') || CURRENT_COMMIT_HASH}
                      </span>
                    </div>
                    {updateStatus === 'checking' ? (
                      <button 
                        disabled
                        className="px-3 py-1 bg-black/5 dark:bg-white/5 rounded-lg opacity-50 flex items-center gap-1.5 animate-pulse"
                      >
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Checking...</span>
                      </button>
                    ) : updateStatus === 'patching' ? (
                      <button 
                        disabled
                        className="px-3 py-1 bg-amber-500/10 text-amber-500 rounded-lg flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Patching...</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleCheckUpdates}
                        className="px-3 py-1 bg-black/5 dark:bg-white/5 active:bg-black/10 dark:active:bg-white/10 rounded-lg opacity-80 active:opacity-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Check Updates</span>
                      </button>
                    )}
                  </div>

                  {updateStatus === 'up-to-date' && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium text-[11px] leading-snug">
                      Your journal app is fully updated with the latest patches!
                    </div>
                  )}

                  {updateStatus === 'available' && latestCommit && (
                    <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex flex-col gap-2.5 text-[11px] leading-relaxed">
                      <div>
                        <p className="font-semibold text-amber-600 dark:text-amber-400 mb-1">New Patch Available ({latestCommit.sha})</p>
                        <p className="opacity-75 italic">"{latestCommit.message}"</p>
                      </div>
                      <button
                        onClick={handleAutoPatch}
                        className="w-full py-2 bg-amber-500 active:bg-amber-600 active:scale-95 text-white rounded-lg font-bold text-center tracking-wider transition-all shadow-sm cursor-pointer"
                      >
                        Auto-Patch & Update Now
                      </button>
                    </div>
                  )}

                  {updateStatus === 'error' && (
                    <div className="p-3 rounded-lg bg-rose-500/10 text-rose-500 font-medium text-[11px] leading-snug animate-fade-in">
                      {errorMessage || "Unable to retrieve update details. Please try again later."}
                    </div>
                  )}
                </div>
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
              className="px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-all whitespace-nowrap active:opacity-75"
              style={{
                backgroundColor: selectedTag === null ? theme.accent : 'transparent',
                color: selectedTag === null ? theme.surface : theme.textSecondary,
              }}
            >
              All Tags
            </button>
            {displayTags.map((tag) => (
              <button
                key={tag}
                onClick={() => onSelectTag(selectedTag === tag ? null : tag)}
                className="px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-all whitespace-nowrap active:opacity-75"
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
                <p className="font-serif text-lg font-medium tracking-tight mb-1" style={{ color: theme.textPrimary }}>Tabula Rasa</p>
                <p className="font-sans text-xs opacity-60 leading-relaxed max-w-[200px]" style={{ color: theme.textSecondary }}>
                  Your canvas is blank. Create a new journal entry to begin.
                </p>
              </>
            ) : (
              <>
                <p className="font-serif text-lg font-medium tracking-tight mb-1" style={{ color: theme.textPrimary }}>No Matches</p>
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
                      className="w-full text-left p-4.5 transition-all duration-200 cursor-pointer rounded-xl relative border"
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
                          {entry.content || 'Start taking records...'}
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
          New Note
        </span>
      </motion.button>
    </div>
  );
}
