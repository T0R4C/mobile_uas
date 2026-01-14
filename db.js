const DB_NAME = "account_vault_db";
const DB_VERSION = 1;
const ACCOUNTS_STORE = "accounts";
const META_STORE = "meta";

let dbPromise;

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => {
      reject(request.error || new Error("IndexedDB request failed"));
    });
  });
}

export function openDB() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.addEventListener("upgradeneeded", () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ACCOUNTS_STORE)) {
        const accountStore = db.createObjectStore(ACCOUNTS_STORE, { keyPath: "id" });
        accountStore.createIndex("platform", "platform", { unique: false });
        accountStore.createIndex("user", "user", { unique: false });
        accountStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    });

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => {
      reject(request.error || new Error("Failed to open IndexedDB"));
    });
  });

  return dbPromise;
}

async function withStore(storeName, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => {
      reject(transaction.error || new Error("IndexedDB transaction failed"));
    });

    Promise.resolve(callback(store))
      .then(resolve)
      .catch(reject);
  });
}

export async function getMeta(key) {
  try {
    const db = await openDB();
    const tx = db.transaction(META_STORE, "readonly");
    const store = tx.objectStore(META_STORE);
    const result = await promisifyRequest(store.get(key));
    return result ? result.value : null;
  } catch (error) {
    console.error("Account Vault meta read failed", error);
    return null;
  }
}

export async function setMeta(key, value) {
  try {
    await withStore(META_STORE, "readwrite", (store) => {
      store.put({ key, value });
    });
    return true;
  } catch (error) {
    console.error("Account Vault meta write failed", error);
    return false;
  }
}

export async function upsertAccount(account) {
  const now = Date.now();
  const record = {
    id: account.id,
    platform: account.platform || "",
    label: account.label || "",
    user: account.user || "",
    passwordEnc: account.passwordEnc || "",
    notes: account.notes || "",
    tags: Array.isArray(account.tags) ? account.tags : [],
    createdAt: account.createdAt || now,
    updatedAt: now,
  };

  try {
    await withStore(ACCOUNTS_STORE, "readwrite", (store) => {
      store.put(record);
    });
    return record;
  } catch (error) {
    console.error("Account Vault account upsert failed", error);
    return null;
  }
}

export async function deleteAccount(id) {
  if (!id) {
    return false;
  }

  try {
    await withStore(ACCOUNTS_STORE, "readwrite", (store) => {
      store.delete(id);
    });
    return true;
  } catch (error) {
    console.error("Account Vault account delete failed", error);
    return false;
  }
}

export async function getAllAccounts() {
  try {
    const db = await openDB();
    const tx = db.transaction(ACCOUNTS_STORE, "readonly");
    const store = tx.objectStore(ACCOUNTS_STORE);
    const result = await promisifyRequest(store.getAll());
    return result || [];
  } catch (error) {
    console.error("Account Vault account fetch failed", error);
    return [];
  }
}
