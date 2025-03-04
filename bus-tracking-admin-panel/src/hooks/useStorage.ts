'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNetwork } from './useNetwork';

interface StorageOptions<T> {
  key: string;
  initialValue?: T;
  storage?: Storage;
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
  encrypt?: boolean;
  encryptionKey?: string;
  validateData?: (value: T) => boolean;
  onError?: (error: Error) => void;
  syncToServer?: (value: T) => Promise<void>;
  persistOnUnmount?: boolean;
}

interface StorageError extends Error {
  type: 'serialize' | 'deserialize' | 'encryption' | 'validation' | 'storage' | 'sync';
}

const createStorageError = (
  message: string,
  type: StorageError['type']
): StorageError => {
  const error = new Error(message) as StorageError;
  error.type = type;
  return error;
};

// Simple encryption/decryption using XOR
const encrypt = (text: string, key: string): string => {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return btoa(result);
};

const decrypt = (text: string, key: string): string => {
  const decoded = atob(text);
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(
      decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
};

export function useStorage<T>({
  key,
  initialValue,
  storage = typeof window !== 'undefined' ? localStorage : null,
  serialize = JSON.stringify,
  deserialize = JSON.parse,
  encrypt: shouldEncrypt = false,
  encryptionKey = 'default-key',
  validateData,
  onError,
  syncToServer,
  persistOnUnmount = true,
}: StorageOptions<T>) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined' || !storage) {
      return initialValue as T;
    }

    try {
      const item = storage.getItem(key);
      if (!item) return initialValue as T;

      let parsed: T;
      if (shouldEncrypt) {
        try {
          const decrypted = decrypt(item, encryptionKey);
          parsed = deserialize(decrypted);
        } catch (error) {
          throw createStorageError('Failed to decrypt data', 'encryption');
        }
      } else {
        parsed = deserialize(item);
      }

      if (validateData && !validateData(parsed)) {
        throw createStorageError('Data validation failed', 'validation');
      }

      return parsed;
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Failed to load data'));
      return initialValue as T;
    }
  });

  const { online } = useNetwork();

  // Save to storage
  const saveToStorage = useCallback(async (value: T) => {
    if (!storage) return;

    try {
      if (validateData && !validateData(value)) {
        throw createStorageError('Data validation failed', 'validation');
      }

      let serialized: string;
      try {
        serialized = serialize(value);
      } catch (error) {
        throw createStorageError('Failed to serialize data', 'serialize');
      }

      if (shouldEncrypt) {
        try {
          serialized = encrypt(serialized, encryptionKey);
        } catch (error) {
          throw createStorageError('Failed to encrypt data', 'encryption');
        }
      }

      storage.setItem(key, serialized);

      if (syncToServer && online) {
        try {
          await syncToServer(value);
        } catch (error) {
          throw createStorageError('Failed to sync with server', 'sync');
        }
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Failed to save data'));
      throw error;
    }
  }, [
    storage,
    key,
    serialize,
    shouldEncrypt,
    encryptionKey,
    validateData,
    syncToServer,
    online,
    onError,
  ]);

  // Update state and storage
  const setValue = useCallback(async (value: T | ((prev: T) => T)) => {
    try {
      const newValue = value instanceof Function ? value(state) : value;
      setState(newValue);
      await saveToStorage(newValue);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Failed to set value'));
    }
  }, [state, saveToStorage, onError]);

  // Remove from storage
  const removeValue = useCallback(async () => {
    try {
      setState(initialValue as T);
      storage?.removeItem(key);
      if (syncToServer && online) {
        await syncToServer(initialValue as T);
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Failed to remove value'));
    }
  }, [storage, key, initialValue, syncToServer, online, onError]);

  // Sync with storage events
  useEffect(() => {
    if (!storage) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          let parsed: T;
          if (shouldEncrypt) {
            const decrypted = decrypt(e.newValue, encryptionKey);
            parsed = deserialize(decrypted);
          } else {
            parsed = deserialize(e.newValue);
          }

          if (validateData && !validateData(parsed)) {
            throw createStorageError('Data validation failed', 'validation');
          }

          setState(parsed);
        } catch (error) {
          onError?.(error instanceof Error ? error : new Error('Failed to sync with storage'));
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [storage, key, shouldEncrypt, encryptionKey, deserialize, validateData, onError]);

  // Persist on unmount
  useEffect(() => {
    if (persistOnUnmount) {
      return () => {
        saveToStorage(state).catch(onError);
      };
    }
  }, [persistOnUnmount, saveToStorage, state, onError]);

  return [state, setValue, removeValue] as const;
}

// Helper hook for managing multiple storage items
export function useStorageGroup<T extends Record<string, any>>(
  items: Record<keyof T, Omit<StorageOptions<T[keyof T]>, 'key'>>,
  groupOptions: Partial<StorageOptions<T>> = {}
) {
  const storage = Object.fromEntries(
    Object.entries(items).map(([key, options]) => [
      key,
      useStorage({
        ...groupOptions,
        ...options,
        key,
      }),
    ])
  ) as {
    [K in keyof T]: ReturnType<typeof useStorage<T[K]>>;
  };

  const setAll = useCallback(async (values: Partial<T>) => {
    await Promise.all(
      Object.entries(values).map(([key, value]) => {
        const setter = storage[key][1];
        return setter(value);
      })
    );
  }, [storage]);

  const removeAll = useCallback(async () => {
    await Promise.all(
      Object.values(storage).map(([, , remove]) => remove())
    );
  }, [storage]);

  return {
    storage,
    setAll,
    removeAll,
  };
}
