'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { debounce } from '@/lib/utils';

interface SearchOptions<T> {
  initialQuery?: string;
  debounceMs?: number;
  minQueryLength?: number;
  searchFields?: Array<keyof T>;
  customSearch?: (item: T, query: string) => boolean;
  onSearch?: (query: string, results: T[]) => void;
  onError?: (error: Error) => void;
  sortResults?: boolean;
  filterEmpty?: boolean;
  caseSensitive?: boolean;
  exactMatch?: boolean;
}

interface UseSearchReturn<T> {
  query: string;
  setQuery: (query: string) => void;
  results: T[];
  isSearching: boolean;
  error: Error | null;
  clearSearch: () => void;
  recentSearches: string[];
  addToRecent: (query: string) => void;
  clearRecent: () => void;
}

const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT_SEARCHES = 10;

export function useSearch<T extends Record<string, any>>(
  items: T[],
  {
    initialQuery = '',
    debounceMs = 300,
    minQueryLength = 1,
    searchFields,
    customSearch,
    onSearch,
    onError,
    sortResults = true,
    filterEmpty = true,
    caseSensitive = false,
    exactMatch = false,
  }: SearchOptions<T> = {}
): UseSearchReturn<T> {
  const [query, setQueryState] = useState(initialQuery);
  const [results, setResults] = useState<T[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Keep track of the latest items for the debounced search function
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Default search function
  const defaultSearch = useCallback((item: T, searchQuery: string) => {
    const normalizeValue = (value: any): string => 
      String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const normalizedQuery = caseSensitive 
      ? searchQuery 
      : normalizeValue(searchQuery).toLowerCase();

    const fields = searchFields || Object.keys(item);

    return fields.some(field => {
      const value = item[field];
      if (value == null) return false;

      const normalizedValue = caseSensitive 
        ? String(value)
        : normalizeValue(value).toLowerCase();

      return exactMatch
        ? normalizedValue === normalizedQuery
        : normalizedValue.includes(normalizedQuery);
    });
  }, [searchFields, caseSensitive, exactMatch]);

  // Perform search
  const performSearch = useCallback((searchQuery: string) => {
    if (!searchQuery && filterEmpty) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    if (searchQuery.length < minQueryLength) {
      setResults(itemsRef.current);
      setIsSearching(false);
      return;
    }

    try {
      setIsSearching(true);
      setError(null);

      const searchFn = customSearch || defaultSearch;
      let searchResults = itemsRef.current.filter(item => 
        searchFn(item, searchQuery)
      );

      if (sortResults) {
        searchResults = searchResults.sort((a, b) => {
          const aMatch = searchFn(a, searchQuery);
          const bMatch = searchFn(b, searchQuery);
          if (aMatch === bMatch) return 0;
          return aMatch ? -1 : 1;
        });
      }

      setResults(searchResults);
      onSearch?.(searchQuery, searchResults);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Search failed');
      setError(error);
      onError?.(error);
    } finally {
      setIsSearching(false);
    }
  }, [
    filterEmpty,
    minQueryLength,
    customSearch,
    defaultSearch,
    sortResults,
    onSearch,
    onError,
  ]);

  // Debounced search
  const debouncedSearch = useMemo(
    () => debounce(performSearch, debounceMs),
    [performSearch, debounceMs]
  );

  // Update query and trigger search
  const setQuery = useCallback((newQuery: string) => {
    setQueryState(newQuery);
    debouncedSearch(newQuery);
  }, [debouncedSearch]);

  // Clear search
  const clearSearch = useCallback(() => {
    setQueryState('');
    setResults(filterEmpty ? [] : items);
    setError(null);
  }, [items, filterEmpty]);

  // Add to recent searches
  const addToRecent = useCallback((searchQuery: string) => {
    if (!searchQuery) return;

    setRecentSearches(prev => {
      const newRecent = [
        searchQuery,
        ...prev.filter(q => q !== searchQuery),
      ].slice(0, MAX_RECENT_SEARCHES);

      if (typeof window !== 'undefined') {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(newRecent));
      }

      return newRecent;
    });
  }, []);

  // Clear recent searches
  const clearRecent = useCallback(() => {
    setRecentSearches([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    }
  }, []);

  // Initial search
  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    } else if (!filterEmpty) {
      setResults(items);
    }
  }, [initialQuery, items, filterEmpty, performSearch]);

  return {
    query,
    setQuery,
    results,
    isSearching,
    error,
    clearSearch,
    recentSearches,
    addToRecent,
    clearRecent,
  };
}

// Helper hook for async search
export function useAsyncSearch<T>(
  searchFn: (query: string) => Promise<T[]>,
  options: Omit<SearchOptions<T>, 'customSearch'> = {}
) {
  const [items, setItems] = useState<T[]>([]);
  const search = useSearch(items, options);

  const performSearch = useCallback(async (query: string) => {
    try {
      const results = await searchFn(query);
      setItems(results);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Search failed');
      options.onError?.(error);
    }
  }, [searchFn, options.onError]);

  const debouncedSearch = useMemo(
    () => debounce(performSearch, options.debounceMs || 300),
    [performSearch, options.debounceMs]
  );

  useEffect(() => {
    if (search.query) {
      debouncedSearch(search.query);
    }
  }, [search.query, debouncedSearch]);

  return {
    ...search,
    items,
  };
}

// Helper hook for search suggestions
export function useSearchSuggestions<T>(
  items: T[],
  getSearchableText: (item: T) => string,
  options: Omit<SearchOptions<T>, 'searchFields' | 'customSearch'> = {}
) {
  const search = useSearch(items, {
    ...options,
    customSearch: (item, query) => {
      const text = getSearchableText(item);
      return options.caseSensitive
        ? text.includes(query)
        : text.toLowerCase().includes(query.toLowerCase());
    },
  });

  const suggestions = useMemo(() => {
    if (!search.query || search.query.length < (options.minQueryLength || 1)) {
      return [];
    }

    const seen = new Set<string>();
    return search.results
      .map(getSearchableText)
      .filter(text => {
        if (seen.has(text)) return false;
        seen.add(text);
        return true;
      })
      .slice(0, 10);
  }, [search.query, search.results, getSearchableText, options.minQueryLength]);

  return {
    ...search,
    suggestions,
  };
}
