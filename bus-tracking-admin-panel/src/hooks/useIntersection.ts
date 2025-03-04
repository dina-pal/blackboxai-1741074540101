'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseIntersectionOptions extends IntersectionObserverInit {
  freezeOnceVisible?: boolean;
  triggerOnce?: boolean;
  skip?: boolean;
  onEnter?: (entry: IntersectionObserverEntry) => void;
  onLeave?: (entry: IntersectionObserverEntry) => void;
  onChange?: (entry: IntersectionObserverEntry) => void;
}

interface UseIntersectionReturn {
  ref: (element: Element | null) => void;
  entry: IntersectionObserverEntry | null;
  isIntersecting: boolean;
  hasIntersected: boolean;
}

export function useIntersection({
  threshold = 0,
  root = null,
  rootMargin = '0px',
  freezeOnceVisible = false,
  triggerOnce = false,
  skip = false,
  onEnter,
  onLeave,
  onChange,
}: UseIntersectionOptions = {}): UseIntersectionReturn {
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const [hasIntersected, setHasIntersected] = useState(false);
  const frozen = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const currentElement = useRef<Element | null>(null);

  const cleanup = useCallback(() => {
    if (observer.current) {
      observer.current.disconnect();
      observer.current = null;
    }
  }, []);

  const createObserver = useCallback(() => {
    cleanup();

    if (skip) return;

    const observerCallback: IntersectionObserverCallback = ([entry]) => {
      setEntry(entry);

      if (entry.isIntersecting) {
        setHasIntersected(true);
        onEnter?.(entry);
        if (triggerOnce) {
          cleanup();
        }
      } else {
        onLeave?.(entry);
      }

      onChange?.(entry);

      if (entry.isIntersecting && freezeOnceVisible) {
        frozen.current = true;
      }
    };

    observer.current = new IntersectionObserver(observerCallback, {
      threshold,
      root,
      rootMargin,
    });

    if (currentElement.current) {
      observer.current.observe(currentElement.current);
    }
  }, [
    threshold,
    root,
    rootMargin,
    freezeOnceVisible,
    triggerOnce,
    skip,
    onEnter,
    onLeave,
    onChange,
    cleanup,
  ]);

  const ref = useCallback(
    (element: Element | null) => {
      if (frozen.current) return;

      cleanup();
      currentElement.current = element;

      if (element) {
        if (!observer.current) {
          createObserver();
        } else {
          observer.current.observe(element);
        }
      }
    },
    [cleanup, createObserver]
  );

  useEffect(() => {
    if (!skip && !frozen.current) {
      createObserver();
    }
    return cleanup;
  }, [skip, createObserver, cleanup]);

  const isIntersecting = entry?.isIntersecting ?? false;

  return {
    ref,
    entry,
    isIntersecting,
    hasIntersected,
  };
}

// Helper hook for lazy loading images
interface UseLazyImageOptions extends UseIntersectionOptions {
  src: string;
  srcSet?: string;
  sizes?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export function useLazyImage({
  src,
  srcSet,
  sizes,
  onLoad,
  onError,
  ...options
}: UseLazyImageOptions) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const { ref, isIntersecting } = useIntersection({
    ...options,
    triggerOnce: true,
  });

  useEffect(() => {
    if (!isIntersecting || !imgRef.current) return;

    const img = imgRef.current;

    const handleLoad = () => {
      setLoaded(true);
      onLoad?.();
    };

    const handleError = () => {
      setError(new Error('Failed to load image'));
      onError?.();
    };

    img.addEventListener('load', handleLoad);
    img.addEventListener('error', handleError);

    if (srcSet) img.srcset = srcSet;
    if (sizes) img.sizes = sizes;
    img.src = src;

    return () => {
      img.removeEventListener('load', handleLoad);
      img.removeEventListener('error', handleError);
    };
  }, [isIntersecting, src, srcSet, sizes, onLoad, onError]);

  const setRef = useCallback(
    (element: HTMLImageElement | null) => {
      imgRef.current = element;
      ref(element);
    },
    [ref]
  );

  return {
    ref: setRef,
    loaded,
    error,
  };
}

// Helper hook for infinite scroll
interface UseInfiniteScrollOptions extends UseIntersectionOptions {
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

export function useInfiniteScroll({
  loadMore,
  hasMore,
  threshold = 0.5,
  ...options
}: UseInfiniteScrollOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { ref, isIntersecting } = useIntersection({
    threshold,
    ...options,
  });

  useEffect(() => {
    if (!isIntersecting || !hasMore || isLoading) return;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        await loadMore();
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load more items'));
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [isIntersecting, hasMore, isLoading, loadMore]);

  return {
    ref,
    isLoading,
    error,
  };
}

// Helper hook for element visibility tracking
interface UseVisibilityTrackerOptions extends UseIntersectionOptions {
  onVisible?: (time: number) => void;
  minVisibleTime?: number;
}

export function useVisibilityTracker({
  onVisible,
  minVisibleTime = 1000,
  ...options
}: UseVisibilityTrackerOptions = {}) {
  const visibleSince = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const { ref, isIntersecting } = useIntersection(options);

  useEffect(() => {
    if (isIntersecting && !visibleSince.current) {
      visibleSince.current = Date.now();
      timeoutRef.current = setTimeout(() => {
        const visibleTime = Date.now() - (visibleSince.current || 0);
        if (visibleTime >= minVisibleTime) {
          onVisible?.(visibleTime);
        }
      }, minVisibleTime);
    } else if (!isIntersecting && visibleSince.current) {
      visibleSince.current = null;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isIntersecting, minVisibleTime, onVisible]);

  return {
    ref,
    isIntersecting,
  };
}
