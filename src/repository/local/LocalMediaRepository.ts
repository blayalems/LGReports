import { getDB } from './db';
import type { MediaBlob, MediaFolderSelection, MediaRepository } from '../MediaRepository';

/** Phase 1 backend: photo bytes live in IndexedDB, never in localStorage. */
export class LocalMediaRepository implements MediaRepository {
  async selectFolder(): Promise<MediaFolderSelection> {
    return { ok: true }; // no Drive folder concept locally
  }

  async upload(id: string, blob: Blob): Promise<void> {
    const db = await getDB();
    await db.put('blobs', { id, blob, mimeType: blob.type });
  }

  async read(id: string): Promise<MediaBlob | null> {
    const db = await getDB();
    const row = await db.get('blobs', id);
    return row ? { id: row.id, blob: row.blob, mimeType: row.mimeType } : null;
  }

  async remove(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('blobs', id);
  }
}
