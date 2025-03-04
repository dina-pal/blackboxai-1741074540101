'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNetwork } from './useNetwork';
import { useLocalStorage } from './useLocalStorage';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface TelemetryEvent {
  id: string;
  type: string;
  level: LogLevel;
  message: string;
  data?: any;
  timestamp: number;
  sessionId: string;
  userId?: string;
}

interface TelemetryOptions {
  endpoint?: string;
  batchSize?: number;
  flushInterval?: number;
  retryAttempts?: number;
  retryDelay?: number;
  maxStorageSize?: number;
  minLogLevel?: LogLevel;
  onError?: (error: Error) => void;
  getUserId?: () => string | undefined;
  transform?: (events: TelemetryEvent[]) => any;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function useTelemetry({
  endpoint,
  batchSize = 50,
  flushInterval = 30000,
  retryAttempts = 3,
  retryDelay = 1000,
  maxStorageSize = 1000,
  minLogLevel = 'info',
  onError,
  getUserId,
  transform,
}: TelemetryOptions = {}) {
  const [events, setEvents] = useLocalStorage<TelemetryEvent[]>('telemetry-events', []);
  const [isProcessing, setIsProcessing] = useState(false);
  const { online } = useNetwork();
  const sessionId = useRef(crypto.randomUUID());
  const flushTimeoutRef = useRef<NodeJS.Timeout>();
  const retryCountRef = useRef<Record<string, number>>({});

  // Generate event ID
  const generateEventId = useCallback(() => {
    return crypto.randomUUID();
  }, []);

  // Check if event should be logged based on level
  const shouldLog = useCallback((level: LogLevel): boolean => {
    return LOG_LEVELS[level] >= LOG_LEVELS[minLogLevel];
  }, [minLogLevel]);

  // Add event to queue
  const logEvent = useCallback((
    type: string,
    level: LogLevel,
    message: string,
    data?: any
  ) => {
    if (!shouldLog(level)) return;

    const event: TelemetryEvent = {
      id: generateEventId(),
      type,
      level,
      message,
      data,
      timestamp: Date.now(),
      sessionId: sessionId.current,
      userId: getUserId?.(),
    };

    setEvents(prev => {
      const newEvents = [...prev, event];
      // Maintain max storage size
      return newEvents.slice(-maxStorageSize);
    });
  }, [generateEventId, shouldLog, getUserId, maxStorageSize, setEvents]);

  // Process event queue
  const processEvents = useCallback(async (retryBatch = false) => {
    if (!endpoint || isProcessing || events.length === 0 || !online) return;

    setIsProcessing(true);
    const batch = events.slice(0, batchSize);

    try {
      const processedEvents = transform ? transform(batch) : batch;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(processedEvents),
      });

      if (!response.ok) {
        throw new Error(`Failed to send telemetry: ${response.statusText}`);
      }

      // Remove processed events from queue
      setEvents(prev => prev.slice(batch.length));
      
      // Reset retry count for successful batch
      batch.forEach(event => {
        delete retryCountRef.current[event.id];
      });
    } catch (error) {
      if (retryBatch) {
        // Update retry counts
        batch.forEach(event => {
          retryCountRef.current[event.id] = (retryCountRef.current[event.id] || 0) + 1;
        });

        // Filter out events that exceeded retry attempts
        const failedEvents = batch.filter(
          event => (retryCountRef.current[event.id] || 0) >= retryAttempts
        );
        if (failedEvents.length > 0) {
          setEvents(prev => prev.filter(event => !failedEvents.includes(event)));
          onError?.(new Error(`Failed to send events after ${retryAttempts} attempts`));
        }

        // Schedule retry for remaining events
        setTimeout(() => {
          processEvents(true);
        }, retryDelay);
      } else {
        onError?.(error instanceof Error ? error : new Error('Failed to process events'));
      }
    } finally {
      setIsProcessing(false);
    }
  }, [
    endpoint,
    isProcessing,
    events,
    online,
    batchSize,
    transform,
    retryAttempts,
    retryDelay,
    setEvents,
    onError,
  ]);

  // Set up flush interval
  useEffect(() => {
    flushTimeoutRef.current = setInterval(() => {
      processEvents(true);
    }, flushInterval);

    return () => {
      if (flushTimeoutRef.current) {
        clearInterval(flushTimeoutRef.current);
      }
    };
  }, [flushInterval, processEvents]);

  // Convenience logging methods
  const debug = useCallback((message: string, data?: any) => {
    logEvent('debug', 'debug', message, data);
  }, [logEvent]);

  const info = useCallback((message: string, data?: any) => {
    logEvent('info', 'info', message, data);
  }, [logEvent]);

  const warn = useCallback((message: string, data?: any) => {
    logEvent('warning', 'warn', message, data);
  }, [logEvent]);

  const error = useCallback((message: string, error?: Error, data?: any) => {
    logEvent('error', 'error', message, {
      ...data,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    });
  }, [logEvent]);

  // Get queue stats
  const getStats = useCallback(() => ({
    queueLength: events.length,
    isProcessing,
    sessionId: sessionId.current,
  }), [events.length, isProcessing]);

  // Force flush events
  const flush = useCallback(async () => {
    await processEvents(true);
  }, [processEvents]);

  // Clear event queue
  const clear = useCallback(() => {
    setEvents([]);
    retryCountRef.current = {};
  }, [setEvents]);

  return {
    debug,
    info,
    warn,
    error,
    logEvent,
    getStats,
    flush,
    clear,
  };
}

// Helper hook for component telemetry
export function useComponentTelemetry(
  componentName: string,
  options?: TelemetryOptions
) {
  const telemetry = useTelemetry(options);

  // Log component lifecycle events
  useEffect(() => {
    telemetry.info(`${componentName} mounted`);
    return () => {
      telemetry.info(`${componentName} unmounted`);
    };
  }, [telemetry, componentName]);

  const logRender = useCallback((props: Record<string, any>) => {
    telemetry.debug(`${componentName} rendered`, { props });
  }, [telemetry, componentName]);

  const logError = useCallback((error: Error, componentMethod: string) => {
    telemetry.error(`${componentName} error in ${componentMethod}`, error);
  }, [telemetry, componentName]);

  return {
    ...telemetry,
    logRender,
    logError,
  };
}
