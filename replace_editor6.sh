#!/bin/bash
sed -i "s/applyFormatting('\*\*', '\*\*')/applyFormatting('bold')/g" src/components/Editor.tsx
sed -i "s/applyFormatting('_', '_')/applyFormatting('italic')/g" src/components/Editor.tsx
sed -i "s/applyFormatting('<u>', '<\/u>')/applyFormatting('underline')/g" src/components/Editor.tsx
sed -i "s/applyFormatting('\\\\n- ')/applyFormatting('bulletList')/g" src/components/Editor.tsx
