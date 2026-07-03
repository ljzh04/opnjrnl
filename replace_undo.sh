#!/bin/bash
sed -i '/const handleUndoDelete = (e?: any) => {/,/  };/c\
  const handleUndoDelete = (e?: any) => {\
    if (e) {\
      e.preventDefault();\
      e.stopPropagation();\
    }\
    if (deletedEntryState) {\
      setEntries(current => {\
        if (dirHandle) saveEntryToDirectory(dirHandle, deletedEntryState.entry);\
        return [deletedEntryState.entry, ...current].sort((a, b) => b.createdAt - a.createdAt);\
      });\
      clearUndoState();\
    }\
  };' src/App.tsx
