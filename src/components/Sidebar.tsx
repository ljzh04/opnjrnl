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
  RefreshCw,
  User,
  AlertTriangle
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
  onClearAllData?: (options?: { deleteCloudBackup?: boolean }) => void;
  onConnectDrive?: () => void;
  driveConnected?: boolean;
  currentUser?: any;
  appPassword?: string | null;
  onUpdateAppPassword?: (pwd: string | null) => void;
  systemLockId?: string | null;
  onUpdateSystemLock?: (id: string | null) => void;
  notificationsEnabled?: boolean;
  notificationTime?: string;
  onUpdateNotifications?: (enabled: boolean, time: string) => void;
  onTestNotification?: () => void;
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
  onClearAllData,
  onConnectDrive,
  driveConnected,
  currentUser,
  appPassword,
  onUpdateAppPassword,
  systemLockId,
  onUpdateSystemLock,
  notificationsEnabled,
  notificationTime,
  onUpdateNotifications,
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
                className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center transition-all bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.06] dark:hover:bg-white/[0.06] border border-black/10 dark:border-white/10 cursor-pointer interactive-target-44"
                title="Google Account & Cloud Backup"
                aria-label="Google Account & Cloud Backup"
              >
                {driveConnected && currentUser ? (
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
                      {driveConnected && currentUser ? (
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
                          
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] tracking-wide uppercase mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Automatic Backup Active
                          </div>
                          
                          <div className="w-full border-t my-2" style={{ borderColor: theme.surfaceBorder }} />
                          
                          <button
                            onClick={() => {
                              setShowAccountDropdown(false);
                              onConnectDrive?.();
                            }}
                            className="w-full py-3 px-4 rounded-xl font-bold tracking-wide transition-all bg-rose-500 hover:bg-rose-600 active:scale-95 text-white cursor-pointer shadow-sm text-center"
                          >
                            Disconnect App Sync
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3.5 text-center py-2">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center border bg-black/[0.02] dark:bg-white/[0.02]" style={{ borderColor: theme.surfaceBorder }}>
                            <User className="w-5 h-5 opacity-40" />
                          </div>
                          <div className="flex flex-col gap-1.5 px-1">
                            <span className="font-bold text-sm tracking-tight">Cloud Secure Sync</span>
                            <p className="opacity-70 text-[11px] leading-relaxed animate-fade-in">
                              Sign in with your Google account to automatically back up and sync your chapters to your own personal Google Drive.
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
            className="w-full py-3 pl-10 pr-9 text-sm rounded-xl transition-all duration-150 outline-none border focus:border-zinc-400 interactive-target-44"
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
                      {!appPassword && !showPasswordSetup && (
                        <button
                          className="px-4 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg opacity-85 hover:opacity-100 transition-colors cursor-pointer interactive-target-44 flex items-center justify-center font-medium"
                          onClick={() => setShowPasswordSetup(true)}
                        >
                          Set password
                        </button>
                      )}
                      {appPassword && !showPasswordRemove && (
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
                     <span className="font-semibold tracking-wide text-[13px] text-rose-500">Clear journal database</span>
                     <p className="opacity-70 text-[11px] leading-relaxed">
                       Instantly delete all local chapters and preferences. Ensure you have exported a backup if you wish to keep your records.
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

               {/* Data Import/Export */}
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
                     <span className="font-semibold tracking-wide">Export backup</span>
                     <span className="text-[10px] opacity-50 text-center">Save a .json copy</span>
                   </button>
                   
                   <label
                     className="flex-1 flex flex-col items-center justify-center gap-2 py-5 px-3 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer interactive-target-44"
                   >
                     <FileUp className="w-5 h-5 opacity-50 mb-1" />
                     <span className="font-semibold tracking-wide">Import data</span>
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

              {/* Cloud Storage Backups Disclosure & Privacy Footer */}
              <div 
                className="rounded-xl border p-4 flex flex-col gap-2.5 text-[10px] leading-relaxed opacity-60 mt-2" 
                style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.surface }}
              >
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs opacity-80">
                  <Cloud className="w-3.5 h-3.5 text-blue-500" />
                  <span>Google Cloud Safety</span>
                </div>
                <p>
                  We prioritize your privacy first. Account backups are saved to a secure, hidden application storage folder inside your private Google Drive as <code className="font-mono text-[9px] font-semibold">opnjrnl_backup.json</code>. The application holds strictly restricted permissions and is sandboxed—it cannot view, access, or alter any other files in your personal Drive.
                </p>
                <div className="border-t pt-2 flex items-center justify-between mt-1" style={{ borderColor: theme.surfaceBorder }}>
                  <span>Managed via top-right profile icon</span>
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
                  <h3 className="text-sm font-bold tracking-tight">Clear entire database?</h3>
                  <p className="opacity-70 text-[10.5px] leading-relaxed">
                    You are trying to erase your local workspace. Ready to proceed?
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
                  <h3 className="text-xs font-bold uppercase tracking-wider opacity-60">Cloud Sync Safety</h3>
                  <p className="font-bold text-[13px] leading-none">Choose Deletion Type</p>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed opacity-75">
                Because your device is linked to Google Drive Cloud Sync, an accidental local clear could compromise your cloud backups. Select a migration standard:
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
                    <span className="text-xs font-bold tracking-tight">1. Keep Cloud Backup Safe</span>
                    <p className="opacity-65 text-[10px] leading-normal font-normal">
                      Logs out from Drive & clears entries on this device only. Remote file on Drive remains safe as a backup.
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
                    <span className="text-xs font-bold tracking-tight text-rose-500">2. Wipe Device + Cloud Backup</span>
                    <p className="opacity-65 text-[10px] leading-normal font-normal">
                      Permanently wipes local entries AND deletes the `opnjrnl_backup.json` storage file from Google Drive.
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
                    {deleteCloudBackupOption ? 'Ultimate Cloud & Local Purge' : 'Confirm Local Base Wipe'}
                  </h3>
                  <p className="opacity-75 text-[10.5px] leading-relaxed">
                    {deleteCloudBackupOption ? (
                      "This action is absolutely permanent and cannot be undone. All local folders AND your opnjrnl_backup.json cloud file will be deleted. Are you 100% sure?"
                    ) : (
                      "This will wipe all local chapters, setting configurations, and credentials on this device. Your remote database in Google Drive is safe and will not be affected. Ready to execute?"
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
}
