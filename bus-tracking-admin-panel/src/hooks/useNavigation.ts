'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

interface NavigationState {
  previousPath: string | null;
  currentPath: string;
  navigationStack: string[];
  searchParams: URLSearchParams;
}

interface NavigationOptions {
  maxHistoryLength?: number;
  persistState?: boolean;
  onNavigate?: (path: string) => void;
  onBack?: () => void;
  onForward?: () => void;
}

export function useNavigation({
  maxHistoryLength = 50,
  persistState = true,
  onNavigate,
  onBack,
  onForward,
}: NavigationOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [state, setState] = useState<NavigationState>({
    previousPath: null,
    currentPath: pathname,
    navigationStack: [pathname],
    searchParams: searchParams,
  });

  const forwardStackRef = useRef<string[]>([]);

  // Update state when path changes
  useEffect(() => {
    if (pathname !== state.currentPath) {
      setState(prev => {
        const newStack = [...prev.navigationStack, pathname].slice(-maxHistoryLength);
        return {
          previousPath: prev.currentPath,
          currentPath: pathname,
          navigationStack: newStack,
          searchParams: searchParams,
        };
      });
      forwardStackRef.current = [];
      onNavigate?.(pathname);
    }
  }, [pathname, searchParams, state.currentPath, maxHistoryLength, onNavigate]);

  // Navigate to a new path
  const navigate = useCallback((
    path: string,
    options?: {
      replace?: boolean;
      scroll?: boolean;
      shallow?: boolean;
      params?: Record<string, string>;
    }
  ) => {
    const url = new URL(path, window.location.origin);
    
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    if (options?.replace) {
      router.replace(url.pathname + url.search);
    } else {
      router.push(url.pathname + url.search);
    }
  }, [router]);

  // Go back in history
  const goBack = useCallback(() => {
    if (state.navigationStack.length > 1) {
      const currentIndex = state.navigationStack.length - 1;
      const previousPath = state.navigationStack[currentIndex - 1];
      
      forwardStackRef.current = [
        ...forwardStackRef.current,
        state.currentPath,
      ].slice(-maxHistoryLength);

      router.back();
      onBack?.();
      
      return previousPath;
    }
    return null;
  }, [state.navigationStack, state.currentPath, router, maxHistoryLength, onBack]);

  // Go forward in history
  const goForward = useCallback(() => {
    if (forwardStackRef.current.length > 0) {
      const nextPath = forwardStackRef.current.pop()!;
      router.forward();
      onForward?.();
      return nextPath;
    }
    return null;
  }, [router, onForward]);

  // Navigate to a specific point in history
  const goTo = useCallback((index: number) => {
    if (index >= 0 && index < state.navigationStack.length) {
      const targetPath = state.navigationStack[index];
      const delta = index - (state.navigationStack.length - 1);
      router.push(targetPath);
      return targetPath;
    }
    return null;
  }, [state.navigationStack, router]);

  // Get URL parameters
  const getParam = useCallback((key: string): string | null => {
    return searchParams.get(key);
  }, [searchParams]);

  // Set URL parameters
  const setParam = useCallback((
    key: string,
    value: string | null,
    options?: { replace?: boolean }
  ) => {
    const newSearchParams = new URLSearchParams(searchParams);
    
    if (value === null) {
      newSearchParams.delete(key);
    } else {
      newSearchParams.set(key, value);
    }

    const newPath = `${pathname}?${newSearchParams.toString()}`;
    
    if (options?.replace) {
      router.replace(newPath);
    } else {
      router.push(newPath);
    }
  }, [pathname, searchParams, router]);

  // Set multiple URL parameters
  const setParams = useCallback((
    params: Record<string, string | null>,
    options?: { replace?: boolean }
  ) => {
    const newSearchParams = new URLSearchParams(searchParams);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        newSearchParams.delete(key);
      } else {
        newSearchParams.set(key, value);
      }
    });

    const newPath = `${pathname}?${newSearchParams.toString()}`;
    
    if (options?.replace) {
      router.replace(newPath);
    } else {
      router.push(newPath);
    }
  }, [pathname, searchParams, router]);

  // Clear all URL parameters
  const clearParams = useCallback((options?: { replace?: boolean }) => {
    const newPath = pathname;
    
    if (options?.replace) {
      router.replace(newPath);
    } else {
      router.push(newPath);
    }
  }, [pathname, router]);

  // Persist navigation state
  useEffect(() => {
    if (persistState) {
      try {
        localStorage.setItem('navigationState', JSON.stringify({
          navigationStack: state.navigationStack,
          forwardStack: forwardStackRef.current,
        }));
      } catch (error) {
        console.error('Failed to persist navigation state:', error);
      }
    }
  }, [state.navigationStack, persistState]);

  // Restore navigation state
  useEffect(() => {
    if (persistState) {
      try {
        const savedState = localStorage.getItem('navigationState');
        if (savedState) {
          const { navigationStack, forwardStack } = JSON.parse(savedState);
          setState(prev => ({
            ...prev,
            navigationStack: navigationStack,
          }));
          forwardStackRef.current = forwardStack;
        }
      } catch (error) {
        console.error('Failed to restore navigation state:', error);
      }
    }
  }, [persistState]);

  return {
    ...state,
    canGoBack: state.navigationStack.length > 1,
    canGoForward: forwardStackRef.current.length > 0,
    navigate,
    goBack,
    goForward,
    goTo,
    getParam,
    setParam,
    setParams,
    clearParams,
  };
}
