'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { useNetwork } from './useNetwork';

interface HydrationState<T> {
  data: T;
  timestamp: number;
  version: number;
  source: 'local' | 'server' | 'initial';
}

interface HydrationOptions<T> {
  key: string;
  initialData: T;
  version?: number;
  fetchData?: () => Promise<T>;
  onHydrated?: (state: HydrationState<T>) => void;
  onError?: (error: Error) => void;
  validate?: (data: T) => boolean;
  transform?: (data: T) => T;
  rehydrateOnFocus?: boolean;
  rehydrateInterval?: number;
  persistLocally?: boolean;
}

export function useHydration<T>({
  key,
  initialData,
  version = 1,
  fetchData,
  onHydrated,
  onError,
  validate,
  transform,
  rehydrateOnFocus = true,
  rehydrateInterval = 0,
  persistLocally = true,
}: HydrationOptions<T>) {
  const [state, setState] = useState<HydrationState<T>>({
    data: initialData,
    timestamp: Date.now(),
    version,
    source: 'initial',
  });

  const [isHydrating, setIsHydrating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { online } = useNetwork();

  const [persistedState, setPersistedState] = useLocalStorage<HydrationState<T> | null>(
    `hydration-${key}`,
    null
  );

  const intervalRef = useRef<NodeJS.Timeout>();
  const isMountedRef = useRef(true);

  // Validate and transform data
  const processData = useCallback((data: T): T => {
    let processed = data;

    if (validate && !validate(processed)) {
      throw new Error('Data validation failed');
    }

    if (transform) {
      processed = transform(processed);
    }

    return processed;
  }, [validate, transform]);

  // Fetch and process data from server
  const fetchAndProcessData = useCallback(async () => {
    if (!fetchData || !online) return null;

    try {
      const data = await fetchData();
      return processData(data);
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to fetch data');
    }
  }, [fetchData, online, processData]);

  // Update state with new data
  const updateState = useCallback((
    data: T,
    source: HydrationState<T>['source']
  ) => {
    const newState: HydrationState<T> = {
      data,
      timestamp: Date.now(),
      version,
      source,
    };

    setState(newState);
    
    if (persistLocally) {
      setPersistedState(newState);
    }

    onHydrated?.(newState);
  }, [version, persistLocally, setPersistedState, onHydrated]);

  // Hydrate state from all sources
  const hydrate = useCallback(async (force = false) => {
    if (isHydrating && !force) return;

    setIsHydrating(true);
    setError(null);

    try {
      // Try to fetch fresh data from server
      const serverData = await fetchAndProcessData();
      if (serverData) {
        updateState(serverData, 'server');
        return;
      }

      // If no server data and we have persisted data, use that
      if (persistedState && persistedState.version === version) {
        try {
          const processedData = processData(persistedState.data);
          updateState(processedData, 'local');
          return;
        } catch (error) {
          console.warn('Failed to process persisted data:', error);
        }
      }

      // Fall back to initial data
      const processedInitial = processData(initialData);
      updateState(processedInitial, 'initial');
    } catch (error) {
      const hydrateError = error instanceof Error ? error : new Error('Hydration failed');
      setError(hydrateError);
      onError?.(hydrateError);
    } finally {
      if (isMountedRef.current) {
        setIsHydrating(false);
      }
    }
  }, [
    isHydrating,
    fetchAndProcessData,
    persistedState,
    version,
    initialData,
    processData,
    updateState,
    onError,
  ]);

  // Set up rehydration interval
  useEffect(() => {
    if (rehydrateInterval > 0) {
      intervalRef.current = setInterval(() => {
        hydrate();
      }, rehydrateInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [rehydrateInterval, hydrate]);

  // Handle window focus
  useEffect(() => {
    if (!rehydrateOnFocus) return;

    const handleFocus = () => {
      hydrate();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [rehydrateOnFocus, hydrate]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initial hydration
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return {
    data: state.data,
    timestamp: state.timestamp,
    source: state.source,
    isHydrating,
    error,
    hydrate,
    setState: (data: T) => updateState(data, 'local'),
  };
}

// Helper hook for managing form state persistence
export function useFormHydration<T extends Record<string, any>>(
  formId: string,
  initialValues: T,
  options?: Omit<HydrationOptions<T>, 'key' | 'initialData'>
) {
  const {
    data,
    setState: setFormData,
    ...hydrationState
  } = useHydration({
    key: `form-${formId}`,
    initialData: initialValues,
    ...options,
  });

  const updateField = useCallback(<K extends keyof T>(
    field: K,
    value: T[K]
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  }, [setFormData]);

  const resetForm = useCallback(() => {
    setFormData(initialValues);
  }, [initialValues, setFormData]);

  return {
    values: data,
    updateField,
    resetForm,
    setValues: setFormData,
    ...hydrationState,
  };
}

// Helper hook for managing list state persistence
export function useListHydration<T>(
  listId: string,
  options?: Omit<HydrationOptions<T[]>, 'key' | 'initialData'>
) {
  const {
    data: items,
    setState: setItems,
    ...hydrationState
  } = useHydration({
    key: `list-${listId}`,
    initialData: [],
    ...options,
  });

  const addItem = useCallback((item: T) => {
    setItems(prev => [...prev, item]);
  }, [setItems]);

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, [setItems]);

  const updateItem = useCallback((index: number, item: T) => {
    setItems(prev => prev.map((prevItem, i) => i === index ? item : prevItem));
  }, [setItems]);

  return {
    items,
    addItem,
    removeItem,
    updateItem,
    setItems,
    ...hydrationState,
  };
}
