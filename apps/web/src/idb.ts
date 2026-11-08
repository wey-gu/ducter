// A one-key IndexedDB store, so the service worker (which can't read localStorage) knows the
// device token when it answers a notification's Go / Hold.
const DB = "ducter";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      if (value === undefined) tx.objectStore(STORE).delete(key);
      else tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    const v = await new Promise<T | undefined>((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return v;
  } catch {
    return undefined;
  }
}
