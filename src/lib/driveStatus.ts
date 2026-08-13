export type DriveStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'syncing'
  | 'error'
  | 'needs-reconnect';

export interface DriveStatusMeta {
  label: string;
  tooltip: string;
  dotColor: string;
}

export function formatLastBackup(ts: number | null): string {
  if (!ts) return 'Never backed up';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return 'Backed up just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Backed up ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Backed up ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Backed up ${days} day${days === 1 ? '' : 's'} ago`;
}

export function driveStatusMeta(status: DriveStatus, lastBackupAt: number | null): DriveStatusMeta {
  switch (status) {
    case 'disconnected':
      return { label: 'Backup off', tooltip: 'Backup off — tap to connect', dotColor: 'bg-zinc-400' };
    case 'connecting':
      return { label: 'Connecting…', tooltip: 'Connecting to Google Drive…', dotColor: 'bg-blue-500 animate-pulse' };
    case 'reconnecting':
      return { label: 'Reconnecting…', tooltip: 'Reconnecting to Google Drive…', dotColor: 'bg-purple-400 animate-pulse' };
    case 'syncing':
      return { label: 'Backing up…', tooltip: 'Backing up to Google Drive…', dotColor: 'bg-blue-500 animate-pulse' };
    case 'error':
      return { label: 'Backup failed', tooltip: 'Backup failed — try again', dotColor: 'bg-rose-500' };
    case 'needs-reconnect':
      return { label: 'Reconnect', tooltip: 'Backup needs attention — tap to reconnect', dotColor: 'bg-amber-500' };
    case 'connected':
    default:
      return { label: formatLastBackup(lastBackupAt), tooltip: formatLastBackup(lastBackupAt), dotColor: 'bg-emerald-500' };
  }
}
