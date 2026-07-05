import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearData, ClearDataDeps } from './clearData';

function makeDeps(overrides?: Partial<ClearDataDeps>): ClearDataDeps {
  return {
    getAccessToken: vi.fn().mockResolvedValue('mock-token'),
    driveFileIdGet: vi.fn().mockResolvedValue('file-123'),
    driveFileIdDel: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    driveFetch: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
    entriesDel: vi.fn().mockResolvedValue(undefined),
    appPasswordDel: vi.fn().mockResolvedValue(undefined),
    syslockDel: vi.fn().mockResolvedValue(undefined),
    localStorageRemoveItem: vi.fn(),
    ...overrides,
  };
}

describe('clearData', () => {
  it('clears cloud backup when deleteCloudBackup is true', async () => {
    const deps = makeDeps();

    await clearData(deps, { deleteCloudBackup: true });

    expect(deps.driveFetch).toHaveBeenCalledWith(
      expect.stringContaining('/files/file-123'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('skips cloud delete when deleteCloudBackup is false', async () => {
    const deps = makeDeps();

    await clearData(deps, { deleteCloudBackup: false });

    expect(deps.driveFetch).not.toHaveBeenCalled();
  });

  it('skips cloud delete when option is undefined', async () => {
    const deps = makeDeps();

    await clearData(deps);

    expect(deps.driveFetch).not.toHaveBeenCalled();
  });

  it('deletes cloud backup before IndexedDB entries', async () => {
    const deps = makeDeps();
    const callOrder: string[] = [];

    deps.driveFetch = vi.fn(async (input) => {
      callOrder.push('cloud-delete');
      return { ok: true, json: () => Promise.resolve({}) } as Response;
    });
    deps.entriesDel = vi.fn(async () => {
      callOrder.push('entries-del');
    });

    await clearData(deps, { deleteCloudBackup: true });

    expect(callOrder).toEqual(['cloud-delete', 'entries-del']);
  });

  it('cloud delete failure does not prevent local cleanup', async () => {
    const deps = makeDeps();
    deps.driveFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await clearData(deps, { deleteCloudBackup: true });

    expect(deps.entriesDel).toHaveBeenCalled();
    expect(deps.appPasswordDel).toHaveBeenCalled();
    expect(deps.syslockDel).toHaveBeenCalled();
  });

  it('logout failure does not prevent local cleanup', async () => {
    const deps = makeDeps();
    deps.logout = vi.fn().mockRejectedValue(new Error('Logout failed'));

    await clearData(deps, { deleteCloudBackup: true });

    expect(deps.entriesDel).toHaveBeenCalled();
    expect(deps.appPasswordDel).toHaveBeenCalled();
    expect(deps.syslockDel).toHaveBeenCalled();
  });

  it('removes localStorage items', async () => {
    const deps = makeDeps();

    await clearData(deps, { deleteCloudBackup: true });

    expect(deps.localStorageRemoveItem).toHaveBeenCalledWith('patched-commit-sha');
    expect(deps.localStorageRemoveItem).toHaveBeenCalledWith('last-notif-fired');
  });

  it('queries Drive API when stored fileId is missing', async () => {
    const deps = makeDeps();
    deps.driveFileIdGet = vi.fn().mockResolvedValue(undefined);
    deps.driveFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ files: [{ id: 'found-file' }] }),
    } as Response);

    await clearData(deps, { deleteCloudBackup: true });

    const queryCall = deps.driveFetch.mock.calls.find(
      (call: any) => String(call[0]).includes('spaces=appDataFolder'),
    );
    expect(queryCall).toBeTruthy();
  });
});
