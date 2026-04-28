const DB_NAME    = 'jastrow';
const DB_VERSION = 1;
const STORE      = 'chunks';

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
    req.onsuccess      = e => resolve(e.target.result);
    req.onerror        = e => reject(e.target.error);
  });
}

async function db() {
  if (!_db) _db = await openDB();
  return _db;
}

export async function getChunk(letter) {
  const store = (await db()).transaction(STORE).objectStore(STORE);
  return new Promise((resolve, reject) => {
    const req = store.get(letter);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function putChunk(letter, data) {
  const store = (await db()).transaction(STORE, 'readwrite').objectStore(STORE);
  return new Promise((resolve, reject) => {
    const req = store.put(data, letter);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}
