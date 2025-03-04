'use client';

import { useState, useEffect, useCallback } from 'react';

interface IndexedDBOptions {
  databaseName: string;
  version?: number;
  stores: {
    [key: string]: {
      keyPath?: string;
      autoIncrement?: boolean;
      indexes?: {
        name: string;
        keyPath: string | string[];
        options?: IDBIndexParameters;
      }[];
    };
  };
  onUpgradeNeeded?: (db: IDBDatabase) => void;
  onError?: (error: Error) => void;
}

interface UseIndexedDBReturn {
  db: IDBDatabase | null;
  error: Error | null;
  isLoading: boolean;
  add: <T>(storeName: string, data: T) => Promise<IDBValidKey>;
  get: <T>(storeName: string, key: IDBValidKey) => Promise<T>;
  getAll: <T>(storeName: string) => Promise<T[]>;
  put: <T>(storeName: string, data: T) => Promise<IDBValidKey>;
  remove: (storeName: string, key: IDBValidKey) => Promise<void>;
  clear: (storeName: string) => Promise<void>;
  count: (storeName: string) => Promise<number>;
  query: <T>(
    storeName: string,
    options: {
      index?: string;
      query?: IDBValidKey | IDBKeyRange;
      direction?: IDBCursorDirection;
      limit?: number;
    }
  ) => Promise<T[]>;
}

export function useIndexedDB({
  databaseName,
  version = 1,
  stores,
  onUpgradeNeeded,
  onError,
}: IndexedDBOptions): UseIndexedDBReturn {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize database
  useEffect(() => {
    const request = indexedDB.open(databaseName, version);

    request.onerror = () => {
      const error = new Error(`Failed to open database: ${request.error?.message}`);
      setError(error);
      onError?.(error);
      setIsLoading(false);
    };

    request.onsuccess = () => {
      setDb(request.result);
      setError(null);
      setIsLoading(false);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores
      Object.entries(stores).forEach(([storeName, storeConfig]) => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, {
            keyPath: storeConfig.keyPath,
            autoIncrement: storeConfig.autoIncrement,
          });

          // Create indexes
          storeConfig.indexes?.forEach((index) => {
            store.createIndex(index.name, index.keyPath, index.options);
          });
        }
      });

      onUpgradeNeeded?.(db);
    };

    return () => {
      if (db) {
        db.close();
      }
    };
  }, [databaseName, version, stores, onUpgradeNeeded, onError]);

  // Generic transaction wrapper
  const transaction = useCallback(<T>(
    storeName: string,
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'));
        return;
      }

      try {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = callback(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }, [db]);

  // Add data
  const add = useCallback(<T>(
    storeName: string,
    data: T
  ): Promise<IDBValidKey> => {
    return transaction<IDBValidKey>(storeName, 'readwrite', (store) =>
      store.add(data)
    );
  }, [transaction]);

  // Get data by key
  const get = useCallback(<T>(
    storeName: string,
    key: IDBValidKey
  ): Promise<T> => {
    return transaction<T>(storeName, 'readonly', (store) =>
      store.get(key)
    );
  }, [transaction]);

  // Get all data
  const getAll = useCallback(<T>(storeName: string): Promise<T[]> => {
    return transaction<T[]>(storeName, 'readonly', (store) =>
      store.getAll()
    );
  }, [transaction]);

  // Put data
  const put = useCallback(<T>(
    storeName: string,
    data: T
  ): Promise<IDBValidKey> => {
    return transaction<IDBValidKey>(storeName, 'readwrite', (store) =>
      store.put(data)
    );
  }, [transaction]);

  // Remove data
  const remove = useCallback((
    storeName: string,
    key: IDBValidKey
  ): Promise<void> => {
    return transaction<void>(storeName, 'readwrite', (store) =>
      store.delete(key)
    );
  }, [transaction]);

  // Clear store
  const clear = useCallback((storeName: string): Promise<void> => {
    return transaction<void>(storeName, 'readwrite', (store) =>
      store.clear()
    );
  }, [transaction]);

  // Count entries
  const count = useCallback((storeName: string): Promise<number> => {
    return transaction<number>(storeName, 'readonly', (store) =>
      store.count()
    );
  }, [transaction]);

  // Query data
  const query = useCallback(<T>(
    storeName: string,
    {
      index,
      query,
      direction = 'next',
      limit,
    }: {
      index?: string;
      query?: IDBValidKey | IDBKeyRange;
      direction?: IDBCursorDirection;
      limit?: number;
    } = {}
  ): Promise<T[]> => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'));
        return;
      }

      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const target = index ? store.index(index) : store;
        const request = target.openCursor(query, direction);
        const results: T[] = [];

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor && (!limit || results.length < limit)) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }, [db]);

  return {
    db,
    error,
    isLoading,
    add,
    get,
    getAll,
    put,
    remove,
    clear,
    count,
    query,
  };
}

// Helper hook for managing a specific store
export function useStore<T>(
  options: IndexedDBOptions,
  storeName: string
) {
  const {
    add,
    get,
    getAll,
    put,
    remove,
    clear,
    count,
    query,
    ...rest
  } = useIndexedDB(options);

  return {
    ...rest,
    add: (data: T) => add<T>(storeName, data),
    get: (key: IDBValidKey) => get<T>(storeName, key),
    getAll: () => getAll<T>(storeName),
    put: (data: T) => put<T>(storeName, data),
    remove: (key: IDBValidKey) => remove(storeName, key),
    clear: () => clear(storeName),
    count: () => count(storeName),
    query: (options?: Parameters<typeof query>[1]) => query<T>(storeName, options),
  };
}
