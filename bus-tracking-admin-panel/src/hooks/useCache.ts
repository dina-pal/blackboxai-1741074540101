'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheOptions<T> {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number;
  validate?: (data: T) => boolean;
  onError?: (error: Error) => void;
  storage?: Storage;
  serialize?: (data: T) => string;
  deserialize?: (data: string) => T;
}

interface UseCacheReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  set: (key: string, data: T) => void;
  get: (key: string) => T | null;
  remove: (key: string) => void;
  clear: () => void;
  has: (key: string) => boolean;
  keys: () => string[];
  refresh: (key: string) => Promise<void>;
}

const defaultOptions = {
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 100,
  serialize: JSON.stringify,
  deserialize: JSON.parse,
};

export function useCache<T>(
  fetcher: (key: string) => Promise<T>,
  {
    ttl = defaultOptions.ttl,
    maxSize = defaultOptions.maxSize,
    validate,
    onError,
    storage,
    serialize = defaultOptions.serialize,
    deserialize = defaultOptions.deserialize,
  }: CacheOptions<T> = {}
): UseCacheReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // In-memory cache
  const cacheRef = useRef(new Map<string, CacheEntry<T>>());
  const accessOrderRef = useRef<string[]>([]);

  // Initialize from storage if available
  useEffect(() => {
    if (!storage) return;

    try {
      const keys = Object.keys(storage).filter(k => k.startsWith('cache:'));
      keys.forEach(key => {
        const rawData = storage.getItem(key);
        if (rawData) {
          const { data, timestamp, expiresAt } = deserialize(rawData);
          if (Date.now() < expiresAt && (!validate || validate(data))) {
            const cacheKey = key.replace('cache:', '');
            cacheRef.current.set(cacheKey, { data, timestamp, expiresAt });
            accessOrderRef.current.push(cacheKey);
          } else {
            storage.removeItem(key);
          }
        }
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to initialize cache');
      setError(error);
      onError?.(error);
    }
  }, [storage, deserialize, validate, onError]);

  // Update access order
  const updateAccessOrder = useCallback((key: string) => {
    accessOrderRef.current = [
      key,
      ...accessOrderRef.current.filter(k => k !== key),
    ];
  }, []);

  // Enforce cache size limit
  const enforceSizeLimit = useCallback(() => {
    while (cacheRef.current.size > maxSize) {
      const lastKey = accessOrderRef.current.pop();
      if (lastKey) {
        cacheRef.current.delete(lastKey);
        if (storage) {
          storage.removeItem(`cache:${lastKey}`);
        }
      }
    }
  }, [maxSize, storage]);

  // Set cache entry
  const set = useCallback((key: string, value: T) => {
    try {
      if (validate && !validate(value)) {
        throw new Error('Invalid data');
      }

      const entry: CacheEntry<T> = {
        data: value,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttl,
      };

      cacheRef.current.set(key, entry);
      updateAccessOrder(key);
      enforceSizeLimit();

      if (storage) {
        storage.setItem(`cache:${key}`, serialize(entry));
      }

      setData(value);
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to set cache entry');
      setError(error);
      onError?.(error);
    }
  }, [ttl, validate, storage, serialize, updateAccessOrder, enforceSizeLimit, onError]);

  // Get cache entry
  const get = useCallback((key: string): T | null => {
    const entry = cacheRef.current.get(key);
    
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      cacheRef.current.delete(key);
      if (storage) {
        storage.removeItem(`cache:${key}`);
      }
      return null;
    }

    updateAccessOrder(key);
    return entry.data;
  }, [storage, updateAccessOrder]);

  // Remove cache entry
  const remove = useCallback((key: string) => {
    cacheRef.current.delete(key);
    accessOrderRef.current = accessOrderRef.current.filter(k => k !== key);
    if (storage) {
      storage.removeItem(`cache:${key}`);
    }
  }, [storage]);

  // Clear cache
  const clear = useCallback(() => {
    cacheRef.current.clear();
    accessOrderRef.current = [];
    if (storage) {
      Object.keys(storage)
        .filter(k => k.startsWith('cache:'))
        .forEach(k => storage.removeItem(k));
    }
  }, [storage]);

  // Check if key exists in cache
  const has = useCallback((key: string): boolean => {
    const entry = cacheRef.current.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      remove(key);
      return false;
    }
    return true;
  }, [remove]);

  // Get all cache keys
  const keys = useCallback((): string[] => {
    return Array.from(cacheRef.current.keys());
  }, []);

  // Refresh cache entry
  const refresh = useCallback(async (key: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const value = await fetcher(key);
      set(key, value);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to refresh cache');
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [fetcher, set, onError]);

  return {
    data,
    isLoading,
    error,
    set,
    get,
    remove,
    clear,
    has,
    keys,
    refresh,
  };
}

// Helper hook for caching paginated data
export function usePaginatedCache<T>(
  fetcher: (page: number) => Promise<T[]>,
  options?: CacheOptions<T[]>
) {
  const cache = useCache<T[]>(
    (key: string) => fetcher(parseInt(key, 10)),
    options
  );

  const fetchPage = useCallback(async (page: number) => {
    const key = page.toString();
    const cached = cache.get(key);
    if (cached) return cached;

    await cache.refresh(key);
    return cache.get(key) || [];
  }, [cache]);

  return {
    ...cache,
    fetchPage,
  };
}

// Helper hook for caching with dependencies
export function useDependentCache<T, D>(
  fetcher: (deps: D) => Promise<T>,
  deps: D,
  options?: CacheOptions<T>
) {
  const cache = useCache<T>(
    () => fetcher(deps),
    options
  );

  const key = JSON.stringify(deps);

  useEffect(() => {
    if (!cache.has(key)) {
      cache.refresh(key);
    }
  }, [cache, key]);

  return {
    ...cache,
    data: cache.get(key),
  };
}
