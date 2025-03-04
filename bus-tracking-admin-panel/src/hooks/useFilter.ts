'use client';

import { useState, useCallback, useMemo } from 'react';

export type FilterOperator = 
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'between'
  | 'in'
  | 'notIn'
  | 'isNull'
  | 'isNotNull';

export interface FilterCondition<T> {
  field: keyof T;
  operator: FilterOperator;
  value: any;
}

interface FilterConfig<T> {
  conditions: FilterCondition<T>[];
  conjunction: 'AND' | 'OR';
}

interface UseFilterOptions<T> {
  initialFilter?: FilterConfig<T>;
  customOperators?: {
    [K in FilterOperator]?: (value: any, filterValue: any) => boolean;
  };
}

interface UseFilterReturn<T> {
  filteredItems: T[];
  filterConfig: FilterConfig<T>;
  addFilter: (condition: FilterCondition<T>) => void;
  removeFilter: (index: number) => void;
  updateFilter: (index: number, condition: FilterCondition<T>) => void;
  clearFilters: () => void;
  setConjunction: (conjunction: 'AND' | 'OR') => void;
}

const defaultOperators = {
  equals: (value: any, filterValue: any) => value === filterValue,
  notEquals: (value: any, filterValue: any) => value !== filterValue,
  contains: (value: any, filterValue: any) => 
    String(value).toLowerCase().includes(String(filterValue).toLowerCase()),
  notContains: (value: any, filterValue: any) => 
    !String(value).toLowerCase().includes(String(filterValue).toLowerCase()),
  startsWith: (value: any, filterValue: any) => 
    String(value).toLowerCase().startsWith(String(filterValue).toLowerCase()),
  endsWith: (value: any, filterValue: any) => 
    String(value).toLowerCase().endsWith(String(filterValue).toLowerCase()),
  greaterThan: (value: any, filterValue: any) => value > filterValue,
  lessThan: (value: any, filterValue: any) => value < filterValue,
  greaterThanOrEqual: (value: any, filterValue: any) => value >= filterValue,
  lessThanOrEqual: (value: any, filterValue: any) => value <= filterValue,
  between: (value: any, filterValue: [any, any]) => 
    value >= filterValue[0] && value <= filterValue[1],
  in: (value: any, filterValue: any[]) => filterValue.includes(value),
  notIn: (value: any, filterValue: any[]) => !filterValue.includes(value),
  isNull: (value: any) => value === null || value === undefined,
  isNotNull: (value: any) => value !== null && value !== undefined,
};

export function useFilter<T extends Record<string, any>>(
  items: T[],
  {
    initialFilter = { conditions: [], conjunction: 'AND' },
    customOperators = {},
  }: UseFilterOptions<T> = {}
): UseFilterReturn<T> {
  const [filterConfig, setFilterConfig] = useState<FilterConfig<T>>(initialFilter);

  const operators = useMemo(
    () => ({ ...defaultOperators, ...customOperators }),
    [customOperators]
  );

  // Apply filters to items
  const filteredItems = useMemo(() => {
    if (filterConfig.conditions.length === 0) return items;

    return items.filter(item => {
      const results = filterConfig.conditions.map(condition => {
        const { field, operator, value } = condition;
        const itemValue = item[field];
        const operatorFn = operators[operator];

        if (!operatorFn) {
          console.warn(`Unknown operator: ${operator}`);
          return true;
        }

        return operatorFn(itemValue, value);
      });

      return filterConfig.conjunction === 'AND'
        ? results.every(Boolean)
        : results.some(Boolean);
    });
  }, [items, filterConfig, operators]);

  // Add a new filter condition
  const addFilter = useCallback((condition: FilterCondition<T>) => {
    setFilterConfig(current => ({
      ...current,
      conditions: [...current.conditions, condition],
    }));
  }, []);

  // Remove a filter condition
  const removeFilter = useCallback((index: number) => {
    setFilterConfig(current => ({
      ...current,
      conditions: current.conditions.filter((_, i) => i !== index),
    }));
  }, []);

  // Update an existing filter condition
  const updateFilter = useCallback((index: number, condition: FilterCondition<T>) => {
    setFilterConfig(current => ({
      ...current,
      conditions: current.conditions.map((c, i) => 
        i === index ? condition : c
      ),
    }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilterConfig(current => ({
      ...current,
      conditions: [],
    }));
  }, []);

  // Set conjunction type
  const setConjunction = useCallback((conjunction: 'AND' | 'OR') => {
    setFilterConfig(current => ({
      ...current,
      conjunction,
    }));
  }, []);

  return {
    filteredItems,
    filterConfig,
    addFilter,
    removeFilter,
    updateFilter,
    clearFilters,
    setConjunction,
  };
}

// Helper hook for text search filtering
export function useSearchFilter<T extends Record<string, any>>(
  items: T[],
  searchFields: Array<keyof T>
) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;

    const normalizedSearchTerm = searchTerm.toLowerCase();
    return items.filter(item =>
      searchFields.some(field => {
        const value = item[field];
        return value != null && 
          String(value).toLowerCase().includes(normalizedSearchTerm);
      })
    );
  }, [items, searchFields, searchTerm]);

  return {
    searchTerm,
    setSearchTerm,
    filteredItems,
  };
}

// Helper hook for combining multiple filters
export function useCombinedFilters<T extends Record<string, any>>(
  items: T[],
  filters: Array<(items: T[]) => T[]>
) {
  return useMemo(
    () => filters.reduce((filteredItems, filter) => filter(filteredItems), items),
    [items, filters]
  );
}
