const DB_NAME = "anpr_dashboard";
const DB_VERSION = 1;
const STORE_NAME = "logs_v1";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("ts_ms", "ts_ms", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function normalizeLog(log) {
  return {
    ...log,
    ts_ms: typeof log?.ts_ms === "number" ? log.ts_ms : Date.now(),
  };
}

export async function appendLogs(logs) {
  if (!logs?.length) return;
  const db = await openDb();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    logs.forEach((log) => store.add(normalizeLog(log)));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getLogsSince(minTsMs) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("ts_ms");
    const range = IDBKeyRange.lowerBound(minTsMs);
    const request = index.openCursor(range);
    const logs = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(logs);
        return;
      }

      logs.push(cursor.value);
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
}

export async function pruneOlderThan(minTsMs) {
  const db = await openDb();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("ts_ms");
    const range = IDBKeyRange.upperBound(minTsMs, true);
    const request = index.openCursor(range);

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function clearPersistedLogs() {
  const db = await openDb();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
