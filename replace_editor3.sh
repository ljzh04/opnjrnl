#!/bin/bash
sed -i '/useLayoutEffect(() => {/,/}, \[content\]);/d' src/components/Editor.tsx
sed -i '/resizeTextarea(contentRef.current);/d' src/components/Editor.tsx
