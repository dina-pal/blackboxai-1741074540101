'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { debounce } from '@/lib/utils';

interface UseInfiniteScrollOptions {
  threshold?: number;
  debounceMs?: number;
  disabled?: boolean;
  rootMargin?: string;
  onLoadMore?: () => Promise<void>;
  onError?: (error: Error) => void;
}

interface UseInfiniteScrollReturn {
  containerRef: React.RefObject<HTMLElement>;
  isLoading: boolean;
  hasMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  reset: () => void;
}

export function useInfiniteScroll({
  threshold = 0.8,
  debounceMs = 100,
  disabled = false,
  rootMargin = '100px',
  onLoadMore,
  onError,
}: UseInfiniteScrollOptions = {}): UseInfiniteScrollReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const containerRef = useRef<HTMLElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef(false);

  // Load more data
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || disabled) return;

    try {
      loadingRef.current = true;
      setIsLoading(true);
      setError(null);

      await onLoadMore?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load more items');
      setError(error);
      onError?.(error);
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [hasMore, disabled, onLoadMore, onError]);

  // Handle intersection
  const handleIntersection = useCallback(
    debounce((entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !disabled) {
        loadMore();
      }
    }, debounceMs),
    [loadMore, hasMore, disabled, debounceMs]
  );

  // Set up intersection observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create new observer
    observerRef.current = new IntersectionObserver(handleIntersection, {
      root: null,
      rootMargin,
      threshold,
    });

    // Start observing
    observerRef.current.observe(container);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [threshold, rootMargin, handleIntersection, disabled]);

  // Reset state
  const reset = useCallback(() => {
    setIsLoading(false);
    setHasMore(true);
    setError(null);
    loadingRef.current = false;
  }, []);

  return {
    containerRef,
    isLoading,
    hasMore,
    error,
    loadMore,
    reset,
  };
}

// Helper hook for infinite scroll with data fetching
interface UseInfiniteScrollDataOptions<T> extends UseInfiniteScrollOptions {
  fetchData: (page: number) => Promise<T[]>;
  initialData?: T[];
  pageSize?: number;
}

export function useInfiniteScrollData<T>({
  fetchData,
  initialData = [],
  pageSize = 20,
  ...options
}: UseInfiniteScrollDataOptions<T>) {
  const [items, setItems] = useState<T[]>(initialData);
  const [currentPage, setCurrentPage] = useState(1);
  
  const infiniteScroll = useInfiniteScroll({
    ...options,
    onLoadMore: async () => {
      const newItems = await fetchData(currentPage);
      if (newItems.length < pageSize) {
        infiniteScroll.hasMore = false;
      }
      setItems(prev => [...prev, ...newItems]);
      setCurrentPage(prev => prev + 1);
    },
  });

  const reset = useCallback(() => {
    setItems(initialData);
    setCurrentPage(1);
    infiniteScroll.reset();
  }, [initialData, infiniteScroll]);

  return {
    ...infiniteScroll,
    items,
    currentPage,
    reset,
  };
}

// Helper hook for infinite scroll with virtualization
interface UseVirtualizedScrollOptions extends UseInfiniteScrollOptions {
  itemHeight: number;
  overscan?: number;
  containerHeight: number;
}

interface VirtualItem {
  index: number;
  offsetTop: number;
}

export function useVirtualizedScroll<T>({
  itemHeight,
  overscan = 3,
  containerHeight,
  ...options
}: UseVirtualizedScrollOptions) {
  const [scrollTop, setScrollTop] = useState(0);
  const infiniteScroll = useInfiniteScroll(options);

  // Calculate visible items
  const virtualItems = useCallback((totalItems: number): VirtualItem[] => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      totalItems - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    const items: VirtualItem[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      items.push({
        index: i,
        offsetTop: i * itemHeight,
      });
    }

    return items;
  }, [scrollTop, itemHeight, containerHeight, overscan]);

  // Handle scroll
  const handleScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return {
    ...infiniteScroll,
    virtualItems,
    totalHeight: 0, // Set this to total items * itemHeight
    handleScroll,
    scrollTop,
  };
}
