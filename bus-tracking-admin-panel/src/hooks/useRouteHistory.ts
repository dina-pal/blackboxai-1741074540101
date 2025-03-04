'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLocalStorage } from './useLocalStorage';

interface RouteEntry {
  pathname: string;
  search: string;
  timestamp: number;
  title?: string;
  state?: any;
}

interface RouteHistoryOptions {
  maxEntries?: number;
  persistHistory?: boolean;
  storageKey?: string;
  onNavigate?: (entry: RouteEntry) => void;
  shouldTrack?: (pathname: string) => boolean;
  transformEntry?: (entry: RouteEntry) => RouteEntry;
}

export function useRouteHistory({
  maxEntries = 50,
  persistHistory = true,
  storageKey = 'route-history',
  onNavigate,
  shouldTrack = () => true,
  transformEntry,
}: RouteHistoryOptions = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [history, setHistory] = useLocalStorage<RouteEntry[]>(storageKey, []);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const isNavigatingRef = useRef(false);

  // Create route entry
  const createEntry = useCallback((
    pathname: string,
    search: string,
    state?: any
  ): RouteEntry => {
    const entry: RouteEntry = {
      pathname,
      search,
      timestamp: Date.now(),
      title: document.title,
      state,
    };

    return transformEntry ? transformEntry(entry) : entry;
  }, [transformEntry]);

  // Add entry to history
  const addToHistory = useCallback((entry: RouteEntry) => {
    if (!shouldTrack(entry.pathname)) return;

    setHistory(prev => {
      // Remove all entries after current index if we're not at the end
      const baseHistory = currentIndex >= 0 && currentIndex < prev.length - 1
        ? prev.slice(0, currentIndex + 1)
        : prev;

      const newHistory = [...baseHistory, entry];
      
      // Limit history size
      return newHistory.slice(-maxEntries);
    });

    setCurrentIndex(prev => prev + 1);
    onNavigate?.(entry);
  }, [maxEntries, currentIndex, shouldTrack, onNavigate, setHistory]);

  // Track route changes
  useEffect(() => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }

    const entry = createEntry(
      pathname,
      searchParams.toString(),
      undefined
    );

    addToHistory(entry);
  }, [pathname, searchParams, createEntry, addToHistory]);

  // Navigate to specific entry
  const navigateToEntry = useCallback((entry: RouteEntry) => {
    isNavigatingRef.current = true;
    window.history.pushState(entry.state, '', entry.pathname + (entry.search ? `?${entry.search}` : ''));
  }, []);

  // Go back in history
  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      const entry = history[currentIndex - 1];
      navigateToEntry(entry);
      setCurrentIndex(prev => prev - 1);
      return entry;
    }
    return null;
  }, [currentIndex, history, navigateToEntry]);

  // Go forward in history
  const goForward = useCallback(() => {
    if (currentIndex < history.length - 1) {
      const entry = history[currentIndex + 1];
      navigateToEntry(entry);
      setCurrentIndex(prev => prev + 1);
      return entry;
    }
    return null;
  }, [currentIndex, history, navigateToEntry]);

  // Go to specific index
  const goToIndex = useCallback((index: number) => {
    if (index >= 0 && index < history.length) {
      const entry = history[index];
      navigateToEntry(entry);
      setCurrentIndex(index);
      return entry;
    }
    return null;
  }, [history, navigateToEntry]);

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, [setHistory]);

  // Get entry at specific index
  const getEntry = useCallback((index: number) => {
    return history[index] || null;
  }, [history]);

  // Get current entry
  const getCurrentEntry = useCallback(() => {
    return currentIndex >= 0 ? history[currentIndex] : null;
  }, [currentIndex, history]);

  // Get previous entry
  const getPreviousEntry = useCallback(() => {
    return currentIndex > 0 ? history[currentIndex - 1] : null;
  }, [currentIndex, history]);

  // Search history
  const searchHistory = useCallback((
    query: string,
    options: { limit?: number; reverse?: boolean } = {}
  ) => {
    const { limit, reverse = false } = options;
    const normalizedQuery = query.toLowerCase();
    
    let results = history.filter(entry =>
      entry.pathname.toLowerCase().includes(normalizedQuery) ||
      entry.title?.toLowerCase().includes(normalizedQuery)
    );

    if (reverse) {
      results = results.reverse();
    }

    if (limit) {
      results = results.slice(0, limit);
    }

    return results;
  }, [history]);

  // Get unique paths
  const getUniquePaths = useCallback(() => {
    const paths = new Set<string>();
    return history
      .reverse()
      .filter(entry => {
        if (paths.has(entry.pathname)) return false;
        paths.add(entry.pathname);
        return true;
      });
  }, [history]);

  return {
    history,
    currentIndex,
    currentEntry: getCurrentEntry(),
    previousEntry: getPreviousEntry(),
    canGoBack: currentIndex > 0,
    canGoForward: currentIndex < history.length - 1,
    goBack,
    goForward,
    goToIndex,
    getEntry,
    clearHistory,
    searchHistory,
    getUniquePaths,
  };
}

// Helper hook for breadcrumb navigation
export function useBreadcrumbHistory(
  options?: Omit<RouteHistoryOptions, 'maxEntries' | 'persistHistory'>
) {
  const { history, currentIndex } = useRouteHistory({
    ...options,
    maxEntries: 10,
    persistHistory: false,
  });

  const getBreadcrumbs = useCallback(() => {
    return history.slice(0, currentIndex + 1).map(entry => ({
      pathname: entry.pathname,
      title: entry.title || entry.pathname,
    }));
  }, [history, currentIndex]);

  return {
    breadcrumbs: getBreadcrumbs(),
    getBreadcrumbs,
  };
}

// Helper hook for recent routes
export function useRecentRoutes(
  options?: Omit<RouteHistoryOptions, 'maxEntries'>
) {
  const { history } = useRouteHistory({
    ...options,
    maxEntries: 5,
  });

  const getRecentRoutes = useCallback(() => {
    const uniquePaths = new Set<string>();
    return history
      .reverse()
      .filter(entry => {
        if (uniquePaths.has(entry.pathname)) return false;
        uniquePaths.add(entry.pathname);
        return true;
      })
      .slice(0, 5);
  }, [history]);

  return {
    recentRoutes: getRecentRoutes(),
    getRecentRoutes,
  };
}
