export interface MediaFolderSelection {
  ok: boolean;
  folderId?: string;
  folderName?: string;
}

export interface MediaBlob {
  id: string;
  blob: Blob;
  mimeType: string;
}

/**
 * Public interface for photo/logo storage. Phase 1 backs this with IndexedDB.
 * Phase 2 backs it with a dedicated shared Drive folder — Sheets rows store only the
 * media id + Drive file id, never the bytes. Files stay private to the leader allowlist.
 */
export interface MediaRepository {
  /** Phase 2 only: leader picks (or the app provisions) the shared Drive folder. No-op locally. */
  selectFolder(): Promise<MediaFolderSelection>;

  upload(id: string, blob: Blob): Promise<void>;
  read(id: string): Promise<MediaBlob | null>;
  remove(id: string): Promise<void>;
}
