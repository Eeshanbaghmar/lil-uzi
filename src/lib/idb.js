// Simple Promise-based IndexedDB wrapper for storing audio stems
const DB_NAME = 'AisiantAudioDB';
const STORE_NAME = 'stems';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // We'll store objects like: { id: "proj1_stem1", projectId: "proj1", name: "vocal.wav", buffer: ArrayBuffer }
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
      }
    };
  });
  
  return dbPromise;
}

export async function saveStemToDB(projectId, stemId, name, arrayBuffer) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const item = {
      id: `${projectId}_${stemId}`,
      projectId,
      stemId,
      name,
      buffer: arrayBuffer
    };
    
    const request = store.put(item);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

export async function getProjectStems(projectId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('projectId');
    
    const request = index.getAll(projectId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteStemFromDB(projectId, stemId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.delete(`${projectId}_${stemId}`);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}
