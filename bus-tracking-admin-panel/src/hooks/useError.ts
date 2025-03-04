'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNotification } from './useNotification';

interface ErrorInfo {
  componentStack: string;
}

interface ErrorBoundaryOptions {
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
  resetKeys?: any[];
}

interface ErrorState {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface UseErrorReturn {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  resetError: () => void;
  setError: (error: Error, errorInfo?: ErrorInfo) => void;
}

export function useError({
  onError,
  onReset,
  resetKeys = [],
}: Omit<ErrorBoundaryOptions, 'fallback'> = {}): UseErrorReturn {
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    errorInfo: null,
  });

  // Reset error state when resetKeys change
  useEffect(() => {
    if (errorState.error) {
      setErrorState({ error: null, errorInfo: null });
      onReset?.();
    }
  }, [...resetKeys]);

  const setError = useCallback((error: Error, errorInfo?: ErrorInfo) => {
    setErrorState({ error, errorInfo: errorInfo || null });
    onError?.(error, errorInfo || { componentStack: '' });
  }, [onError]);

  const resetError = useCallback(() => {
    setErrorState({ error: null, errorInfo: null });
    onReset?.();
  }, [onReset]);

  return {
    error: errorState.error,
    errorInfo: errorState.errorInfo,
    resetError,
    setError,
  };
}

// Helper hook for handling async errors
interface UseAsyncErrorOptions {
  onError?: (error: Error) => void;
  showNotification?: boolean;
}

export function useAsyncError({
  onError,
  showNotification = true,
}: UseAsyncErrorOptions = {}) {
  const { error: showError } = useNotification();
  const [error, setError] = useState<Error | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleError = useCallback((error: unknown) => {
    if (!isMounted.current) return;

    const normalizedError = error instanceof Error ? error : new Error(String(error));
    setError(normalizedError);
    onError?.(normalizedError);

    if (showNotification) {
      showError('Error', normalizedError.message);
    }
  }, [onError, showNotification, showError]);

  const clearError = useCallback(() => {
    if (isMounted.current) {
      setError(null);
    }
  }, []);

  const wrapPromise = useCallback(async <T>(promise: Promise<T>): Promise<T> => {
    try {
      const result = await promise;
      clearError();
      return result;
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, [handleError, clearError]);

  return {
    error,
    handleError,
    clearError,
    wrapPromise,
  };
}

// Helper hook for handling form submission errors
interface UseFormErrorOptions extends UseAsyncErrorOptions {
  resetOnSubmit?: boolean;
}

export function useFormError({
  onError,
  showNotification = true,
  resetOnSubmit = true,
}: UseFormErrorOptions = {}) {
  const {
    error,
    handleError,
    clearError,
    wrapPromise,
  } = useAsyncError({ onError, showNotification });

  const handleSubmit = useCallback(async <T>(
    submitFn: () => Promise<T>
  ): Promise<T | undefined> => {
    if (resetOnSubmit) {
      clearError();
    }

    try {
      return await wrapPromise(submitFn());
    } catch (err) {
      return undefined;
    }
  }, [clearError, wrapPromise, resetOnSubmit]);

  return {
    error,
    handleError,
    clearError,
    handleSubmit,
  };
}

// Helper hook for handling API errors
interface UseApiErrorOptions extends UseAsyncErrorOptions {
  retryCount?: number;
  retryDelay?: number;
}

export function useApiError({
  onError,
  showNotification = true,
  retryCount = 3,
  retryDelay = 1000,
}: UseApiErrorOptions = {}) {
  const {
    error,
    handleError,
    clearError,
    wrapPromise,
  } = useAsyncError({ onError, showNotification });

  const retryPromise = useCallback(async <T>(
    promiseFn: () => Promise<T>,
    currentRetry = 0
  ): Promise<T> => {
    try {
      return await promiseFn();
    } catch (err) {
      if (currentRetry < retryCount) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return retryPromise(promiseFn, currentRetry + 1);
      }
      throw err;
    }
  }, [retryCount, retryDelay]);

  const fetchWithRetry = useCallback(async <T>(
    promiseFn: () => Promise<T>
  ): Promise<T | undefined> => {
    try {
      return await wrapPromise(retryPromise(promiseFn));
    } catch (err) {
      return undefined;
    }
  }, [wrapPromise, retryPromise]);

  return {
    error,
    handleError,
    clearError,
    fetchWithRetry,
  };
}

// Helper hook for handling validation errors
interface ValidationError extends Error {
  field?: string;
  value?: any;
}

export function useValidationError({
  onError,
  showNotification = true,
}: UseAsyncErrorOptions = {}) {
  const {
    error,
    handleError: handleBaseError,
    clearError,
  } = useAsyncError({ onError, showNotification });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleError = useCallback((error: ValidationError) => {
    handleBaseError(error);
    if (error.field) {
      setFieldErrors(prev => ({
        ...prev,
        [error.field!]: error.message,
      }));
    }
  }, [handleBaseError]);

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  const clearAllErrors = useCallback(() => {
    clearError();
    setFieldErrors({});
  }, [clearError]);

  return {
    error,
    fieldErrors,
    handleError,
    clearError: clearAllErrors,
    clearFieldError,
  };
}
