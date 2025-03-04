'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface DebounceOptions {
  delay?: number;
  maxWait?: number;
  leading?: boolean;
  trailing?: boolean;
}

interface ThrottleOptions {
  delay?: number;
  leading?: boolean;
  trailing?: boolean;
}

export function useDebounce<T>(value: T, options: DebounceOptions = {}): T {
  const {
    delay = 500,
    maxWait,
    leading = false,
    trailing = true,
  } = options;

  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const maxWaitTimeoutRef = useRef<NodeJS.Timeout>();
  const lastCallTimeRef = useRef<number>(Date.now());
  const valueRef = useRef(value);
  const leadingRef = useRef(true);

  useEffect(() => {
    valueRef.current = value;

    const shouldCallImmediately = leading && leadingRef.current;
    leadingRef.current = false;

    if (shouldCallImmediately) {
      setDebouncedValue(value);
      lastCallTimeRef.current = Date.now();
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set up maxWait timeout if specified
    if (maxWait && !maxWaitTimeoutRef.current) {
      maxWaitTimeoutRef.current = setTimeout(() => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        setDebouncedValue(valueRef.current);
        lastCallTimeRef.current = Date.now();
        maxWaitTimeoutRef.current = undefined;
      }, maxWait);
    }

    if (trailing) {
      timeoutRef.current = setTimeout(() => {
        setDebouncedValue(valueRef.current);
        lastCallTimeRef.current = Date.now();
        if (maxWaitTimeoutRef.current) {
          clearTimeout(maxWaitTimeoutRef.current);
          maxWaitTimeoutRef.current = undefined;
        }
      }, delay);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (maxWaitTimeoutRef.current) {
        clearTimeout(maxWaitTimeoutRef.current);
      }
    };
  }, [value, delay, maxWait, leading, trailing]);

  return debouncedValue;
}

export function useDebounceCallback<T extends (...args: any[]) => any>(
  callback: T,
  options: DebounceOptions = {}
): T {
  const {
    delay = 500,
    maxWait,
    leading = false,
    trailing = true,
  } = options;

  const timeoutRef = useRef<NodeJS.Timeout>();
  const maxWaitTimeoutRef = useRef<NodeJS.Timeout>();
  const lastCallTimeRef = useRef<number>(Date.now());
  const leadingRef = useRef(true);
  const argsRef = useRef<any[]>([]);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    ((...args: Parameters<T>) => {
      argsRef.current = args;

      const shouldCallImmediately = leading && leadingRef.current;
      leadingRef.current = false;

      if (shouldCallImmediately) {
        callbackRef.current(...args);
        lastCallTimeRef.current = Date.now();
        return;
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (maxWait && !maxWaitTimeoutRef.current) {
        maxWaitTimeoutRef.current = setTimeout(() => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          callbackRef.current(...argsRef.current);
          lastCallTimeRef.current = Date.now();
          maxWaitTimeoutRef.current = undefined;
        }, maxWait);
      }

      if (trailing) {
        timeoutRef.current = setTimeout(() => {
          callbackRef.current(...argsRef.current);
          lastCallTimeRef.current = Date.now();
          if (maxWaitTimeoutRef.current) {
            clearTimeout(maxWaitTimeoutRef.current);
            maxWaitTimeoutRef.current = undefined;
          }
        }, delay);
      }
    }) as T,
    [delay, maxWait, leading, trailing]
  );
}

export function useThrottle<T>(value: T, options: ThrottleOptions = {}): T {
  const {
    delay = 500,
    leading = true,
    trailing = true,
  } = options;

  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastCallTimeRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const valueRef = useRef(value);
  const leadingRef = useRef(true);

  useEffect(() => {
    valueRef.current = value;
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTimeRef.current;

    const shouldCallImmediately = leading && leadingRef.current;
    leadingRef.current = false;

    if (shouldCallImmediately || timeSinceLastCall >= delay) {
      setThrottledValue(value);
      lastCallTimeRef.current = now;
    } else if (trailing && !timeoutRef.current) {
      timeoutRef.current = setTimeout(() => {
        setThrottledValue(valueRef.current);
        lastCallTimeRef.current = Date.now();
        timeoutRef.current = undefined;
      }, delay - timeSinceLastCall);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay, leading, trailing]);

  return throttledValue;
}

export function useThrottleCallback<T extends (...args: any[]) => any>(
  callback: T,
  options: ThrottleOptions = {}
): T {
  const {
    delay = 500,
    leading = true,
    trailing = true,
  } = options;

  const lastCallTimeRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const argsRef = useRef<any[]>([]);
  const callbackRef = useRef(callback);
  const leadingRef = useRef(true);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    ((...args: Parameters<T>) => {
      argsRef.current = args;
      const now = Date.now();
      const timeSinceLastCall = now - lastCallTimeRef.current;

      const shouldCallImmediately = leading && leadingRef.current;
      leadingRef.current = false;

      if (shouldCallImmediately || timeSinceLastCall >= delay) {
        callbackRef.current(...args);
        lastCallTimeRef.current = now;
      } else if (trailing && !timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          callbackRef.current(...argsRef.current);
          lastCallTimeRef.current = Date.now();
          timeoutRef.current = undefined;
        }, delay - timeSinceLastCall);
      }
    }) as T,
    [delay, leading, trailing]
  );
}
