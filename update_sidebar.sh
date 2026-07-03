#!/bin/bash
sed -i 's/\.replace(\/\[#_\*~\`>\]\/g, '\'\''\)//g' src/components/Sidebar.tsx
sed -i 's/\.replace(\/\\\[(.*?)\]\\(.*?\\)\/g, '\''\$1'\''\)//g' src/components/Sidebar.tsx
sed -i 's/\.replace(\/!\\\[(.*?)\]\\(.*?\\)\/g, '\''\$1'\''\)//g' src/components/Editor.tsx
sed -i 's/\.replace(\/^\\s\*\[-+*\]\\s+\/gm, '\'\''\)//g' src/components/Sidebar.tsx

