#!/bin/bash
sed -i '/const handleNewEntry = () => {/,/  };/c\
  const handleNewEntry = () => {\
    clearUndoState();\
    const newEntry: JournalEntry = {\
      id: uuidv4(),\
      title: "",\
      content: "",\
      createdAt: Date.now(),\
      updatedAt: Date.now(),\
      tags: [],\
    };\
    setEntries(current => {\
      if (dirHandle) saveEntryToDirectory(dirHandle, newEntry);\
      return [newEntry, ...current];\
    });\
    setActiveEntryId(newEntry.id);\
  };' src/App.tsx
