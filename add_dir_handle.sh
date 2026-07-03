#!/bin/bash
sed -i 's/const \[entries, setEntries\] = useState<JournalEntry\[\]>(\[\]);/const \[entries, setEntries\] = useState<JournalEntry\[\]>(\[\]);\n  const \[dirHandle, setDirHandle\] = useState<any>(null);/g' src/App.tsx
