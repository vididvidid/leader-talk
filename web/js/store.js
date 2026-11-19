// Saves progress on the device (IndexedDB, with a localStorage fallback). Nothing is ever sent anywhere.
import { emptyState, migrate } from "./progress.js";

const DB = "leadertalk", STORE = "kv", KEY = "state";

function openDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(KEY);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(v) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(v, KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadState() {
  try { return migrate(await idbGet()); } catch { /* fall through */ }
  try { return migrate(JSON.parse(localStorage.getItem("leadertalk-state"))); } catch { return emptyState(); }
}

export async function saveState(state) {
  try { await idbSet(state); return; } catch { /* fall through */ }
  try { localStorage.setItem("leadertalk-state", JSON.stringify(state)); } catch { /* storage unavailable: keep in memory */ }
}

export async function requestPersistence() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* optional */ }
}
