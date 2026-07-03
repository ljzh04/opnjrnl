#!/bin/bash
sed -i '/const handleUpdateEntry = useCallback((id: string, updates: Partial<JournalEntry>) => {/,/}, \[\]);/c\
  const handleUpdateEntry = useCallback((id: string, updates: Partial<JournalEntry>) => {\
    setEntries(current => {\
      const newEntries = current.map(entry =>\
        entry.id === id ? { ...entry, ...updates } : entry\
      );\
      if (dirHandle) {\
        const updatedEntry = newEntries.find(e => e.id === id);\
        if (updatedEntry) saveEntryToDirectory(dirHandle, updatedEntry);\
      }\
      return newEntries;\
    });\
  }, [dirHandle]);' src/App.tsx

sed -i '/const handleDeleteEntry = useCallback((id: string) => {/,/}, \[\]);/c\
  const handleDeleteEntry = useCallback((id: string) => {\
    setEntries(current => {\
      const entryToDelete = current.find(e => e.id === id);\
      if (entryToDelete) {\
        setDeletedEntryState({ entry: entryToDelete });\
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);\
        undoTimeoutRef.current = setTimeout(() => {\
          setDeletedEntryState(null);\
        }, 10000);\
      }\
      if (dirHandle) {\
        deleteEntryFromDirectory(dirHandle, id);\
      }\
      return current.filter(entry => entry.id !== id);\
    });\
\
    setActiveEntryId(current => (current === id ? null : current));\
  }, [dirHandle]);' src/App.tsx

