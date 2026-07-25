const DATABASE_NAME = "chatlite-failed-voice-v1";
const STORE_NAME = "uploads";

export function createFailedVoiceUploadStorage(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) return unavailableStorage();

  let databasePromise;
  const database = () => {
    if (!databasePromise) databasePromise = openDatabase(indexedDB);
    return databasePromise;
  };

  return {
    async put(record) {
      const db = await database();
      await transaction(db, "readwrite", store => store.put(record));
    },
    async getAll() {
      const db = await database();
      return transaction(db, "readonly", store => requestResult(store.getAll()));
    },
    async delete(id) {
      const db = await database();
      await transaction(db, "readwrite", store => store.delete(id));
    }
  };
}

function unavailableStorage() {
  return { put: async () => {}, getAll: async () => [], delete: async () => {} };
}

function openDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("failed voice storage unavailable"));
  });
}

function transaction(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    let result;
    let resultPromise;
    tx.oncomplete = () => {
      if (resultPromise) resultPromise.then(resolve, reject);
      else resolve(result);
    };
    tx.onerror = () => reject(tx.error || new Error("failed voice storage transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("failed voice storage transaction aborted"));
    try {
      const value = operation(tx.objectStore(STORE_NAME));
      if (value?.then) resultPromise = value;
      else result = value;
    } catch (error) {
      reject(error);
    }
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("failed voice storage read failed"));
  });
}
