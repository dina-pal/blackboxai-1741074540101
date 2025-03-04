'use client';

import { useState, useCallback, useMemo } from 'react';
import { PAGINATION } from '@/lib/constants';

interface PaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
  total?: number;
  maxPageButtons?: number;
}

interface PaginationResult {
  page: number;
  pageSize: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  pageNumbers: number[];
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  goToPage: (page: number) => void;
}

export function usePagination({
  initialPage = 1,
  initialPageSize = PAGINATION.DEFAULT_PAGE_SIZE,
  total = 0,
  maxPageButtons = 5,
}: PaginationOptions = {}): PaginationResult {
  const [page, setPageInternal] = useState(initialPage);
  const [pageSize, setPageSizeInternal] = useState(initialPageSize);

  const totalPages = useMemo(() => 
    Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  );

  // Ensure page is within valid range
  const currentPage = useMemo(() => 
    Math.min(Math.max(1, page), totalPages),
    [page, totalPages]
  );

  // Calculate start and end indices
  const startIndex = useMemo(() => 
    (currentPage - 1) * pageSize,
    [currentPage, pageSize]
  );

  const endIndex = useMemo(() => 
    Math.min(startIndex + pageSize, total),
    [startIndex, pageSize, total]
  );

  // Navigation state
  const hasNextPage = currentPage < totalPages;
  const hasPreviousPage = currentPage > 1;

  // Generate array of page numbers to display
  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);

    // Adjust if we're near the end
    if (endPage - startPage + 1 < maxPageButtons) {
      startPage = Math.max(1, endPage - maxPageButtons + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }, [currentPage, totalPages, maxPageButtons]);

  // Navigation handlers
  const setPage = useCallback((newPage: number) => {
    setPageInternal(Math.min(Math.max(1, newPage), totalPages));
  }, [totalPages]);

  const setPageSize = useCallback((newPageSize: number) => {
    const newTotalPages = Math.ceil(total / newPageSize);
    const newPage = Math.min(currentPage, newTotalPages);
    setPageSizeInternal(newPageSize);
    setPageInternal(newPage);
  }, [total, currentPage]);

  const nextPage = useCallback(() => {
    if (hasNextPage) {
      setPageInternal(currentPage + 1);
    }
  }, [currentPage, hasNextPage]);

  const previousPage = useCallback(() => {
    if (hasPreviousPage) {
      setPageInternal(currentPage - 1);
    }
  }, [currentPage, hasPreviousPage]);

  const firstPage = useCallback(() => {
    setPageInternal(1);
  }, []);

  const lastPage = useCallback(() => {
    setPageInternal(totalPages);
  }, [totalPages]);

  const goToPage = useCallback((pageNumber: number) => {
    setPageInternal(Math.min(Math.max(1, pageNumber), totalPages));
  }, [totalPages]);

  return {
    page: currentPage,
    pageSize,
    totalPages,
    startIndex,
    endIndex,
    hasNextPage,
    hasPreviousPage,
    pageNumbers,
    setPage,
    setPageSize,
    nextPage,
    previousPage,
    firstPage,
    lastPage,
    goToPage,
  };
}

// Helper hook for server-side pagination
interface ServerPaginationOptions extends PaginationOptions {
  queryKey: string;
  fetchData: (page: number, pageSize: number) => Promise<{ data: any[]; total: number }>;
}

export function useServerPagination<T>({
  queryKey,
  fetchData,
  ...options
}: ServerPaginationOptions) {
  const pagination = usePagination(options);
  const { data, isLoading, error } = useQuery(
    [queryKey, pagination.page, pagination.pageSize],
    () => fetchData(pagination.page, pagination.pageSize),
    {
      keepPreviousData: true,
      onSuccess: (response) => {
        pagination.setPage(Math.min(pagination.page, Math.ceil(response.total / pagination.pageSize)));
      },
    }
  );

  return {
    ...pagination,
    data: data?.data as T[],
    isLoading,
    error,
  };
}

// Helper hook for client-side pagination
export function useClientPagination<T>(items: T[], options?: PaginationOptions) {
  const pagination = usePagination({
    ...options,
    total: items.length,
  });

  const paginatedItems = useMemo(() => 
    items.slice(pagination.startIndex, pagination.endIndex),
    [items, pagination.startIndex, pagination.endIndex]
  );

  return {
    ...pagination,
    items: paginatedItems,
  };
}

// Helper hook for infinite scroll pagination
interface InfinitePaginationOptions extends PaginationOptions {
  fetchNextPage: () => Promise<any[]>;
  hasMore: boolean;
}

export function useInfinitePagination<T>({
  fetchNextPage,
  hasMore,
  ...options
}: InfinitePaginationOptions) {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    setError(null);

    try {
      const newItems = await fetchNextPage();
      setItems(prev => [...prev, ...newItems]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load more items'));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, fetchNextPage]);

  return {
    items,
    isLoading,
    error,
    hasMore,
    loadMore,
  };
}
