'use client';

import { useState, useCallback, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

interface UseSortingOptions<T> {
  initialSort?: SortConfig;
  defaultDirection?: SortDirection;
  sortFns?: {
    [K in keyof T]?: (a: T[K], b: T[K]) => number;
  };
}

interface UseSortingReturn<T> {
  sortedItems: T[];
  sortConfig: SortConfig | null;
  sort: (key: keyof T) => void;
  setSortConfig: (config: SortConfig | null) => void;
  getSortIcon: (key: keyof T) => string;
  isSorted: (key: keyof T) => boolean;
  getSortDirection: (key: keyof T) => SortDirection | undefined;
}

export function useSorting<T extends Record<string, any>>(
  items: T[],
  {
    initialSort,
    defaultDirection = 'asc',
    sortFns = {},
  }: UseSortingOptions<T> = {}
): UseSortingReturn<T> {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(initialSort || null);

  // Generic sort function that handles different data types
  const defaultSort = useCallback((a: any, b: any): number => {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;

    // Handle different data types
    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b);
    }
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length - b.length;
    }
    if (typeof a === 'boolean' && typeof b === 'boolean') {
      return a === b ? 0 : a ? -1 : 1;
    }

    // Convert to string for other types
    return String(a).localeCompare(String(b));
  }, []);

  // Sort items based on current configuration
  const sortedItems = useMemo(() => {
    if (!sortConfig) return [...items];

    const { key, direction } = sortConfig;
    const sortFn = sortFns[key as keyof T] || defaultSort;

    return [...items].sort((a, b) => {
      const result = sortFn(a[key], b[key]);
      return direction === 'asc' ? result : -result;
    });
  }, [items, sortConfig, sortFns, defaultSort]);

  // Toggle sort for a column
  const sort = useCallback((key: keyof T) => {
    setSortConfig(currentConfig => {
      if (!currentConfig || currentConfig.key !== key) {
        return { key: key as string, direction: defaultDirection };
      }
      if (currentConfig.direction === 'asc') {
        return { key: key as string, direction: 'desc' };
      }
      return null;
    });
  }, [defaultDirection]);

  // Get sort icon for a column
  const getSortIcon = useCallback((key: keyof T): string => {
    if (!sortConfig || sortConfig.key !== key) return '↕️';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  }, [sortConfig]);

  // Check if a column is currently sorted
  const isSorted = useCallback((key: keyof T): boolean => {
    return sortConfig?.key === key;
  }, [sortConfig]);

  // Get sort direction for a column
  const getSortDirection = useCallback((key: keyof T): SortDirection | undefined => {
    if (!sortConfig || sortConfig.key !== key) return undefined;
    return sortConfig.direction;
  }, [sortConfig]);

  return {
    sortedItems,
    sortConfig,
    sort,
    setSortConfig,
    getSortIcon,
    isSorted,
    getSortDirection,
  };
}

// Helper hook for multi-column sorting
interface MultiSortConfig {
  key: string;
  direction: SortDirection;
  priority: number;
}

interface UseMultiSortingOptions<T> extends Omit<UseSortingOptions<T>, 'initialSort'> {
  initialSort?: MultiSortConfig[];
  maxSortFields?: number;
}

export function useMultiSorting<T extends Record<string, any>>(
  items: T[],
  {
    initialSort = [],
    maxSortFields = 3,
    defaultDirection = 'asc',
    sortFns = {},
  }: UseMultiSortingOptions<T> = {}
) {
  const [sortConfigs, setSortConfigs] = useState<MultiSortConfig[]>(initialSort);

  // Sort items based on multiple sort configurations
  const sortedItems = useMemo(() => {
    if (sortConfigs.length === 0) return [...items];

    return [...items].sort((a, b) => {
      for (const { key, direction, priority } of sortConfigs.sort((x, y) => x.priority - y.priority)) {
        const sortFn = sortFns[key as keyof T] || defaultSort;
        const result = sortFn(a[key], b[key]);
        if (result !== 0) {
          return direction === 'asc' ? result : -result;
        }
      }
      return 0;
    });
  }, [items, sortConfigs, sortFns]);

  // Toggle sort for a column
  const toggleSort = useCallback((key: keyof T, event: React.MouseEvent) => {
    setSortConfigs(current => {
      const existingConfig = current.find(config => config.key === key);
      const otherConfigs = current.filter(config => config.key !== key);

      // If shift is not pressed, clear other sorts
      if (!event.shiftKey) {
        if (!existingConfig) {
          return [{ key: key as string, direction: defaultDirection, priority: 0 }];
        }
        if (existingConfig.direction === 'asc') {
          return [{ key: key as string, direction: 'desc', priority: 0 }];
        }
        return [];
      }

      // Handle multi-sort with shift
      if (!existingConfig) {
        if (otherConfigs.length >= maxSortFields) {
          return [...otherConfigs.slice(1), { key: key as string, direction: defaultDirection, priority: maxSortFields - 1 }];
        }
        return [...otherConfigs, { key: key as string, direction: defaultDirection, priority: otherConfigs.length }];
      }

      if (existingConfig.direction === 'asc') {
        return [...otherConfigs, { ...existingConfig, direction: 'desc' }];
      }

      return otherConfigs;
    });
  }, [maxSortFields, defaultDirection]);

  return {
    sortedItems,
    sortConfigs,
    toggleSort,
    setSortConfigs,
  };
}
