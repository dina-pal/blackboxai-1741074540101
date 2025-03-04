'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNetwork } from './useNetwork';
import { useLocalStorage } from './useLocalStorage';

interface SyncOptions<T> {
  key: string;
  initialData?: T;
  syncInterval?: number;
  retryAttempts?: number;
  retryDelay?: number;
  onSync?: (data: T) => void;
  onError?: (error: Error) => void;
  fetchData?: () => Promise<T>;
  pushData?: (data: T) => Promise<void>;
  mergeStrategy?: (local: T, remote: T) => T;
  validateData?: (data: T) => boolean;
}

interface SyncState<T> {
  data: T;
  lastSynced: Date | null;
  isSyncing: boolean;
  error: Error | null;
  syncStatus: 'idle' | 'syncing' | 'error' | 'success';
}

interface PendingChange<T> {
  timestamp: number;
  data: Partial<T>;
  type: 'update' | 'delete';
}

export function useSync<T>({
  key,
  initialData,
  syncInterval = 30000,
  retryAttempts = 3,
  retryDelay = 1000,
  onSync,
  onError,
  fetchData,
  pushData,
  mergeStrategy,
  validateData,
}: SyncOptions<T>) {
  const [state, setState] = useState<SyncState<T>>({
    data: initialData as T,
    lastSynced: null,
    isSyncing: false,
    error: null,
    syncStatus: 'idle',
  });

  const { online, retryRequest } = useNetwork();
  const [pendingChanges, setPendingChanges] = useLocalStorage<PendingChange<T>[]>(
    `${key}_pending_changes`,
    []
  );
  const syncTimeoutRef = useRef<NodeJS.Timeout>();
  const isMounted = useRef(true);

  // Default merge strategy
  const defaultMergeStrategy = (local: T, remote: T): T => ({
    ...local,
    ...remote,
  });

  const merge = mergeStrategy || defaultMergeStrategy;

  // Validate data before applying changes
  const validateAndApply = useCallback((newData: T): boolean => {
    if (validateData && !validateData(newData)) {
      return false;
    }
    return true;
  }, [validateData]);

  // Sync data with server
  const sync = useCallback(async () => {
    if (!online || !fetchData || state.isSyncing) return;

    setState(prev => ({ ...prev, isSyncing: true, syncStatus: 'syncing' }));

    try {
      // Fetch remote data
      const remoteData = await retryRequest(
        () => fetchData(),
        retryAttempts,
        retryDelay
      );

      // Apply pending changes
      let finalData = remoteData;
      for (const change of pendingChanges) {
        if (change.type === 'update') {
          finalData = merge(finalData, change.data as T);
        }
      }

      // Validate merged data
      if (!validateAndApply(finalData)) {
        throw new Error('Data validation failed');
      }

      // Push pending changes to server
      if (pushData && pendingChanges.length > 0) {
        await retryRequest(
          () => pushData(finalData),
          retryAttempts,
          retryDelay
        );
        setPendingChanges([]);
      }

      if (isMounted.current) {
        setState({
          data: finalData,
          lastSynced: new Date(),
          isSyncing: false,
          error: null,
          syncStatus: 'success',
        });
        onSync?.(finalData);
      }
    } catch (error) {
      const syncError = error instanceof Error ? error : new Error('Sync failed');
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          isSyncing: false,
          error: syncError,
          syncStatus: 'error',
        }));
        onError?.(syncError);
      }
    }
  }, [
    online,
    fetchData,
    state.isSyncing,
    pendingChanges,
    retryRequest,
    retryAttempts,
    retryDelay,
    merge,
    validateAndApply,
    pushData,
    setPendingChanges,
    onSync,
    onError,
  ]);

  // Update data locally
  const update = useCallback((changes: Partial<T>) => {
    setState(prev => {
      const newData = merge(prev.data, changes as T);
      if (!validateAndApply(newData)) {
        return prev;
      }

      setPendingChanges(prevChanges => [
        ...prevChanges,
        {
          timestamp: Date.now(),
          data: changes,
          type: 'update',
        },
      ]);

      return {
        ...prev,
        data: newData,
      };
    });
  }, [merge, validateAndApply, setPendingChanges]);

  // Force sync
  const forceSync = useCallback(async () => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    await sync();
  }, [sync]);

  // Set up periodic sync
  useEffect(() => {
    if (syncInterval > 0) {
      syncTimeoutRef.current = setInterval(sync, syncInterval);
    }

    return () => {
      if (syncTimeoutRef.current) {
        clearInterval(syncTimeoutRef.current);
      }
    };
  }, [sync, syncInterval]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Sync when coming online
  useEffect(() => {
    if (online && pendingChanges.length > 0) {
      sync();
    }
  }, [online, pendingChanges, sync]);

  return {
    ...state,
    update,
    forceSync,
    pendingChanges,
  };
}

// Helper hook for syncing multiple resources
interface ResourceSync<T> {
  key: string;
  fetchData: () => Promise<T>;
  pushData?: (data: T) => Promise<void>;
  mergeStrategy?: (local: T, remote: T) => T;
}

export function useSyncGroup<T extends Record<string, any>>(
  resources: ResourceSync<T>[],
  options: Omit<SyncOptions<T>, 'key' | 'fetchData' | 'pushData' | 'mergeStrategy'> = {}
) {
  const syncs = resources.map(resource => 
    useSync({
      ...options,
      ...resource,
    })
  );

  const isSyncing = syncs.some(sync => sync.isSyncing);
  const hasError = syncs.some(sync => sync.error !== null);
  const lastSynced = syncs.reduce((latest, sync) => {
    if (!latest || (sync.lastSynced && sync.lastSynced > latest)) {
      return sync.lastSynced;
    }
    return latest;
  }, null as Date | null);

  const forceSync = useCallback(async () => {
    await Promise.all(syncs.map(sync => sync.forceSync()));
  }, [syncs]);

  return {
    syncs,
    isSyncing,
    hasError,
    lastSynced,
    forceSync,
  };
}

// Helper hook for optimistic updates
export function useOptimisticSync<T>(
  options: SyncOptions<T> & {
    onRollback?: (error: Error) => void;
  }
) {
  const sync = useSync(options);
  const [optimisticData, setOptimisticData] = useState<T | null>(null);

  const update = useCallback(async (changes: Partial<T>) => {
    // Apply optimistic update
    setOptimisticData(prev => ({
      ...(prev || sync.data),
      ...changes,
    }));

    try {
      await sync.update(changes);
      setOptimisticData(null);
    } catch (error) {
      // Rollback on error
      setOptimisticData(null);
      options.onRollback?.(
        error instanceof Error ? error : new Error('Update failed')
      );
      throw error;
    }
  }, [sync, options.onRollback]);

  return {
    ...sync,
    data: optimisticData || sync.data,
    update,
  };
}
