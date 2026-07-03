#!/bin/bash

# We will just replace the useEffect completely
sed -i '/\/\/ Initial persistent state restoration/,/setIsLoaded(true); \/\/ Proceed anyway with default values/c\
  // Initial persistent state restoration\
  useEffect(() => {\
    Promise.all([\
      get<JournalEntry[]>(ENTRIES_STORAGE_KEY),\
      get<MinimalThemeId>(THEME_STORAGE_KEY),\
      get<string | null>(APP_PASSWORD_KEY),\
      get<string | null>(APP_SYSLOCK_KEY),\
      get<{ notificationsEnabled: boolean, notificationTime: string }>(APP_SETTINGS_KEY),\
      getSavedDirectoryHandleInfo()\
    ]).then(async ([storedEntries, storedThemeId, storedPassword, storedSyslock, storedSettings, dirHandleInfo]) => {\
      if (dirHandleInfo) {\
        setDirHandle(dirHandleInfo.handle);\
        if (!dirHandleInfo.requiresPermission) {\
          const dirEntries = await loadEntriesFromDirectory(dirHandleInfo.handle);\
          setEntries(dirEntries);\
        } else {\
          // Requires permission, let UI prompt, load IDB fallback for now\
          if (storedEntries) {\
            const polished = storedEntries.map(entry => ({\
              ...entry,\
              tags: entry.tags || []\
            }));\
            setEntries(polished);\
          }\
        }\
      } else if (storedEntries) {\
        const polished = storedEntries.map(entry => ({\
          ...entry,\
          tags: entry.tags || []\
        }));\
        setEntries(polished);\
      }\
      if (storedThemeId && MINIMAL_THEMES[storedThemeId]) {\
        setThemeId(storedThemeId);\
      }\
      if (storedPassword) {\
        setAppPassword(storedPassword);\
        setAppLocked(true);\
      }\
      if (storedSyslock) {\
        setSystemLockId(storedSyslock);\
        setAppLocked(true);\
      }\
      if (storedSettings) {\
        setNotificationsEnabled(storedSettings.notificationsEnabled);\
        setNotificationTime(storedSettings.notificationTime || "20:00");\
      }\
      setIsLoaded(true);\
    }).catch((err) => {\
      console.error("Storage load error:", err);\
      setIsLoaded(true);\
    });\
' src/App.tsx

