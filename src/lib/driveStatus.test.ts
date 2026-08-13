import { describe, it, expect } from 'vitest';
import { driveStatusMeta, formatLastBackup, DriveStatus } from './driveStatus';

describe('formatLastBackup', () => {
  it('returns "Never backed up" for null', () => {
    expect(formatLastBackup(null)).toBe('Never backed up');
  });

  it('returns "just now" for a recent timestamp', () => {
    expect(formatLastBackup(Date.now() - 5000)).toBe('Backed up just now');
  });

  it('formats minutes ago', () => {
    expect(formatLastBackup(Date.now() - 2 * 60 * 1000)).toBe('Backed up 2 min ago');
  });

  it('formats hours ago', () => {
    expect(formatLastBackup(Date.now() - 2 * 60 * 60 * 1000)).toBe('Backed up 2 hours ago');
  });

  it('uses singular for one hour', () => {
    expect(formatLastBackup(Date.now() - 60 * 60 * 1000)).toBe('Backed up 1 hour ago');
  });

  it('formats days ago', () => {
    expect(formatLastBackup(Date.now() - 3 * 24 * 60 * 60 * 1000)).toBe('Backed up 3 days ago');
  });
});

describe('driveStatusMeta', () => {
  const cases: { status: DriveStatus; label: string; dotColor: string }[] = [
    { status: 'disconnected', label: 'Backup off', dotColor: 'bg-zinc-400' },
    { status: 'connecting', label: 'Connecting…', dotColor: 'bg-blue-500 animate-pulse' },
    { status: 'reconnecting', label: 'Reconnecting…', dotColor: 'bg-purple-400 animate-pulse' },
    { status: 'syncing', label: 'Backing up…', dotColor: 'bg-blue-500 animate-pulse' },
    { status: 'error', label: 'Backup failed', dotColor: 'bg-rose-500' },
    { status: 'needs-reconnect', label: 'Reconnect', dotColor: 'bg-amber-500' },
  ];

  it.each(cases)('maps $status to label and color', ({ status, label, dotColor }) => {
    const meta = driveStatusMeta(status, null);
    expect(meta.label).toBe(label);
    expect(meta.dotColor).toBe(dotColor);
    expect(meta.tooltip.length).toBeGreaterThan(0);
  });

  it('connected state shows last backup time', () => {
    const meta = driveStatusMeta('connected', Date.now() - 3 * 60 * 1000);
    expect(meta.label).toBe('Backed up 3 min ago');
    expect(meta.dotColor).toBe('bg-emerald-500');
  });

  it('connected state with no backup shows "Never backed up"', () => {
    const meta = driveStatusMeta('connected', null);
    expect(meta.label).toBe('Never backed up');
  });
});
