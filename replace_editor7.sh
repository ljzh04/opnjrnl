#!/bin/bash
sed -i "s/applyFormatting('\[', '\](url)')/{ const url = window.prompt('URL'); if (url) applyFormatting('link', url); }/g" src/components/Editor.tsx
sed -i "s/applyFormatting('!\[alt text\](', ')')/{ const url = window.prompt('Image URL'); if (url) applyFormatting('image', url); }/g" src/components/Editor.tsx
