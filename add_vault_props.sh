#!/bin/bash
sed -i 's/  onUpdateNotifications?: (enabled: boolean, time: string) => void;/  onUpdateNotifications?: (enabled: boolean, time: string) => void;\n  vaultName?: string | null;\n  onSelectVault?: () => void;\n  onDisconnectVault?: () => void;/g' src/components/Sidebar.tsx
sed -i 's/  notificationTime,/  notificationTime,\n  onUpdateNotifications,\n  vaultName,\n  onSelectVault,\n  onDisconnectVault/g' src/components/Sidebar.tsx
