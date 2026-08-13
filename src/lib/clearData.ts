export interface ClearDataDeps {
  getAccessToken: () => Promise<string | null>;
  driveFileIdGet: () => Promise<string | undefined>;
  driveFileIdDel: () => Promise<void>;
  logout: () => Promise<void>;
  driveFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  entriesDel: () => Promise<void>;
  appPasswordDel: () => Promise<void>;
  syslockDel: () => Promise<void>;
  localStorageRemoveItem: (key: string) => void;
  encSaltDel?: () => Promise<void>;
  encVerifyDel?: () => Promise<void>;
}

export async function clearData(
  deps: ClearDataDeps,
  options?: { deleteCloudBackup?: boolean },
): Promise<void> {
  if (options?.deleteCloudBackup) {
    try {
      const accessToken = await deps.getAccessToken();
      if (accessToken) {
        let fileId = await deps.driveFileIdGet();
        if (!fileId) {
          const fileQ = encodeURIComponent("name = 'opnjrnl_backup.json' and trashed = false");
          const fileRes = await deps.driveFetch(
            `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${fileQ}&fields=files(id)`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const fileData = await fileRes.json();
          if (fileData.files && fileData.files.length > 0) {
            fileId = fileData.files[0].id;
          }
        }
        if (fileId) {
          await deps.driveFetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
          );
        }
      }
    } catch {}
  }

  try {
    await deps.logout();
  } catch {}

  await deps.driveFileIdDel();

  try {
    await deps.entriesDel();
    await deps.appPasswordDel();
    await deps.syslockDel();
    await deps.encSaltDel?.();
    await deps.encVerifyDel?.();
  } catch {}

  deps.localStorageRemoveItem('patched-commit-sha');
  deps.localStorageRemoveItem('last-notif-fired');
}
