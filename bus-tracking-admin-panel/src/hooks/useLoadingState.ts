'use client';

import { useState, useCallback, useRef } from 'react';
import { useNotification } from './useNotification';

interface LoadingState {
  isLoading: boolean;
  error: Error | null;
  isError: boolean;
  isSuccess: boolean;
}

interface UseLoadingStateOptions {
  onError?: (error: Error) => void;
  onSuccess?: () => void;
  showErrorNotification?: boolean;
  showSuccessNotification?: boolean;
  successMessage?: string;
  errorMessage?: string;
}

export function useLoadingState(options: UseLoadingStateOptions = {}) {
  const [state, setState] = useState<LoadingState>({
    isLoading: false,
    error: null,
    isError: false,
    isSuccess: false,
  });
  const { error: notifyError, success: notifySuccess } = useNotification();
  const mountedRef = useRef(true);

  // Ensure we don't update state after unmount
  const safeSetState = useCallback((updates: Partial<LoadingState>) => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  const reset = useCallback(() => {
    safeSetState({
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: false,
    });
  }, [safeSetState]);

  const execute = useCallback(async <T>(
    promise: Promise<T>,
    localOptions: UseLoadingStateOptions = {}
  ): Promise<T> => {
    const mergedOptions = { ...options, ...localOptions };
    
    try {
      safeSetState({
        isLoading: true,
        error: null,
        isError: false,
        isSuccess: false,
      });

      const result = await promise;

      safeSetState({
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
      });

      if (mergedOptions.showSuccessNotification) {
        notifySuccess('Success', mergedOptions.successMessage || 'Operation completed successfully');
      }

      mergedOptions.onSuccess?.();
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An unknown error occurred');
      
      safeSetState({
        isLoading: false,
        error,
        isError: true,
        isSuccess: false,
      });

      if (mergedOptions.showErrorNotification) {
        notifyError('Error', mergedOptions.errorMessage || error.message);
      }

      mergedOptions.onError?.(error);
      throw error;
    }
  }, [options, safeSetState, notifyError, notifySuccess]);

  return {
    ...state,
    execute,
    reset,
  };
}

// Helper hook for handling async operations with retries
interface RetryOptions extends UseLoadingStateOptions {
  maxRetries?: number;
  retryDelay?: number;
  shouldRetry?: (error: Error, attemptCount: number) => boolean;
}

export function useLoadingStateWithRetry(options: RetryOptions = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    shouldRetry = () => true,
    ...loadingStateOptions
  } = options;

  const { execute, ...state } = useLoadingState(loadingStateOptions);

  const executeWithRetry = useCallback(async <T>(
    promise: () => Promise<T>,
    localOptions: RetryOptions = {}
  ): Promise<T> => {
    const mergedOptions = {
      maxRetries,
      retryDelay,
      shouldRetry,
      ...localOptions,
    };

    let lastError: Error | null = null;
    let attemptCount = 0;

    while (attemptCount < mergedOptions.maxRetries) {
      try {
        return await execute(promise(), localOptions);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('An unknown error occurred');
        attemptCount++;

        if (
          attemptCount < mergedOptions.maxRetries &&
          mergedOptions.shouldRetry(lastError, attemptCount)
        ) {
          await new Promise(resolve => setTimeout(resolve, mergedOptions.retryDelay));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError;
  }, [execute, maxRetries, retryDelay, shouldRetry]);

  return {
    ...state,
    execute: executeWithRetry,
  };
}

// Helper hook for handling concurrent loading states
export function useConcurrentLoadingState(options: UseLoadingStateOptions = {}) {
  const [pendingCount, setPendingCount] = useState(0);
  const { execute, ...state } = useLoadingState(options);

  const executeAll = useCallback(async <T>(
    promises: Array<() => Promise<T>>,
    localOptions: UseLoadingStateOptions = {}
  ): Promise<T[]> => {
    setPendingCount(promises.length);

    try {
      const results = await Promise.all(
        promises.map(async (promise) => {
          try {
            const result = await execute(promise(), localOptions);
            setPendingCount(count => count - 1);
            return result;
          } catch (error) {
            setPendingCount(count => count - 1);
            throw error;
          }
        })
      );

      return results;
    } finally {
      setPendingCount(0);
    }
  }, [execute]);

  return {
    ...state,
    pendingCount,
    isPartiallyLoaded: pendingCount > 0 && pendingCount < state.isLoading ? 1 : 0,
    executeAll,
  };
}

// Helper hook for handling loading states with progress
export function useLoadingStateWithProgress(options: UseLoadingStateOptions = {}) {
  const [progress, setProgress] = useState(0);
  const { execute, ...state } = useLoadingState(options);

  const executeWithProgress = useCallback(async <T>(
    promise: (onProgress: (progress: number) => void) => Promise<T>,
    localOptions: UseLoadingStateOptions = {}
  ): Promise<T> => {
    setProgress(0);

    const handleProgress = (value: number) => {
      setProgress(Math.min(Math.max(value, 0), 100));
    };

    try {
      const result = await execute(promise(handleProgress), localOptions);
      setProgress(100);
      return result;
    } catch (error) {
      setProgress(0);
      throw error;
    }
  }, [execute]);

  return {
    ...state,
    progress,
    executeWithProgress,
  };
}
