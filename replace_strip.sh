#!/bin/bash
sed -i '212,221c\
  const stripMarkdown = (str: string) => {\
    if (!str) return "Start taking records...";\
    return str.replace(/<[^>]*>?/gm, "").trim();\
  };' src/components/Sidebar.tsx
