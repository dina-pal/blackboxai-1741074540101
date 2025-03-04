'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { debounce } from '@/lib/utils';

interface PersistOptions<T> {
  key: string;
  version?: number;
  serialize?: (data: T) => string;
  deserialize?: (data: string) => T;
  debounceTime?: number;
  validateData?: (data: T) => boolean;
  onError?: (error: Error) => void;
  storage?: Storage;
}

interface PersistedData<T> {
  data: T;
  version: number;
  timestamp: number;
}

interface UsePersistReturn<T> {
  data: T;
  setData: (newData: T | ((prev: T) => T)) => void;
  isPersisted: boolean;
  lastPersistedAt: Date | null;
  error: Error | null;
  reset: () => void;
  forcePersist: () => void;
}

const defaultSerialize = JSON.stringify;
const defaultDeserialize = JSON.parse;

export function usePersist<T>(
  initialData: T,
  {
    key,
    version = 1,
    serialize = defaultSerialize,
    deserialize = defaultDeserialize,
    debounceTime = 1000,
    validateData,
    onError,
    storage = typeof window !== 'undefined' ? window.localStorage : null,
  }: PersistOptions<T>
): UsePersistReturn<T> {
  const [data, setDataInternal] = useState<T>(initialData);
  const [isPersisted, setIsPersisted] = useState(false);
  const [lastPersistedAt, setLastPersistedAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  // Keep track of the latest data for the debounced persist function
  const latestDataRef = useRef(data);
  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  // Load persisted data on mount
  useEffect(() => {
    if (!storage) return;

    try {
      const persistedJson = storage.getItem(key);
      if (persistedJson) {
        const persisted: PersistedData<T> = deserialize(persistedJson);

        // Version check
        if (persisted.version !== version) {
          throw new Error(`Version mismatch: stored ${persisted.version}, current ${version}`);
        }

        // Validate data if validator provided
        if (validateData && !validateData(persisted.data)) {
          throw new Error('Data validation failed');
        }

        setDataInternal(persisted.data);
        setIsPersisted(true);
        setLastPersistedAt(new Date(persisted.timestamp));
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load persisted data');
      setError(error);
      onError?.(error);
    }
  }, [key, version, deserialize, validateData, storage, onError]);

  // Persist data with debounce
  const persistData = useCallback(
    debounce(() => {
      if (!storage) return;

      try {
        const persistedData: PersistedData<T> = {
          data: latestDataRef.current,
          version,
          timestamp: Date.now(),
        };

        storage.setItem(key, serialize(persistedData));
        setIsPersisted(true);
        setLastPersistedAt(new Date(persistedData.timestamp));
        setError(null);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to persist data');
        setError(error);
        onError?.(error);
      }
    }, debounceTime),
    [key, version, serialize, storage, onError, debounceTime]
  );

  // Update data and trigger persist
  const setData = useCallback((newData: T | ((prev: T) => T)) => {
    setDataInternal(prev => {
      const nextData = newData instanceof Function ? newData(prev) : newData;
      
      if (validateData && !validateData(nextData)) {
        const error = new Error('Data validation failed');
        setError(error);
        onError?.(error);
        return prev;
      }

      return nextData;
    });
  }, [validateData, onError]);

  // Persist data when it changes
  useEffect(() => {
    persistData();
  }, [data, persistData]);

  // Force immediate persist
  const forcePersist = useCallback(() => {
    persistData.flush();
  }, [persistData]);

  // Reset to initial data
  const reset = useCallback(() => {
    setDataInternal(initialData);
    if (storage) {
      try {
        storage.removeItem(key);
        setIsPersisted(false);
        setLastPersistedAt(null);
        setError(null);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to reset data');
        setError(error);
        onError?.(error);
      }
    }
  }, [initialData, key, storage, onError]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      persistData.flush();
    };
  }, [persistData]);

  return {
    data,
    setData,
    isPersisted,
    lastPersistedAt,
    error,
    reset,
    forcePersist,
  };
}

// Helper hook for persisting form data
export function usePersistForm<T extends Record<string, any>>(
  formKey: string,
  initialValues: T,
  options?: Omit<PersistOptions<T>, 'key'>
) {
  const {
    data: values,
    setData: setValues,
    reset,
    ...rest
  } = usePersist(initialValues, {
    key: `form_${formKey}`,
    ...options,
  });

  const handleChange = useCallback((field: keyof T) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const value = event.target.type === 'checkbox'
      ? (event.target as HTMLInputElement).checked
      : event.target.value;

    setValues(prev => ({
      ...prev,
      [field]: value,
    }));
  }, [setValues]);

  return {
    values,
    setValues,
    handleChange,
    reset,
    ...rest,
  };
}

// Helper hook for persisting table state
export interface TableState {
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, any>;
  pageSize?: number;
  selectedIds?: string[];
}

export function usePersistTableState(
  tableKey: string,
  initialState: TableState = {},
  options?: Omit<PersistOptions<TableState>, 'key'>
) {
  return usePersist(initialState, {
    key: `table_${tableKey}`,
    ...options,
  });
}
