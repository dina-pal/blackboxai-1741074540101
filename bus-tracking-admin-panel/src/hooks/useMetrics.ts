'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNetwork } from './useNetwork';

interface MetricEvent {
  name: string;
  value?: number;
  tags?: Record<string, string>;
  timestamp?: number;
}

interface MetricBatch {
  events: MetricEvent[];
  timestamp: number;
}

interface UseMetricsOptions {
  batchSize?: number;
  batchInterval?: number;
  endpoint?: string;
  onError?: (error: Error) => void;
  transform?: (events: MetricEvent[]) => any;
  disabled?: boolean;
  sampleRate?: number;
}

export function useMetrics({
  batchSize = 10,
  batchInterval = 5000,
  endpoint,
  onError,
  transform,
  disabled = false,
  sampleRate = 1,
}: UseMetricsOptions = {}) {
  const [queue, setQueue] = useState<MetricEvent[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { online } = useNetwork();
  const batchTimeoutRef = useRef<NodeJS.Timeout>();
  const failedBatchesRef = useRef<MetricBatch[]>([]);

  // Process metric queue
  const processQueue = useCallback(async () => {
    if (isProcessing || queue.length === 0 || !online || disabled) return;

    try {
      setIsProcessing(true);
      const batch = queue.slice(0, batchSize);
      const events = transform ? transform(batch) : batch;

      if (endpoint) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            events,
            timestamp: Date.now(),
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to send metrics: ${response.statusText}`);
        }
      }

      // Remove processed events from queue
      setQueue(prev => prev.slice(batch.length));

      // Process failed batches if any
      if (failedBatchesRef.current.length > 0) {
        const failedBatch = failedBatchesRef.current[0];
        await fetch(endpoint!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(failedBatch),
        });
        failedBatchesRef.current.shift();
      }
    } catch (error) {
      // Store failed batch for retry
      failedBatchesRef.current.push({
        events: queue.slice(0, batchSize),
        timestamp: Date.now(),
      });
      onError?.(error instanceof Error ? error : new Error('Failed to process metrics'));
    } finally {
      setIsProcessing(false);
    }
  }, [queue, batchSize, online, disabled, endpoint, transform, onError]);

  // Set up batch processing interval
  useEffect(() => {
    if (disabled) return;

    batchTimeoutRef.current = setInterval(processQueue, batchInterval);

    return () => {
      if (batchTimeoutRef.current) {
        clearInterval(batchTimeoutRef.current);
      }
    };
  }, [processQueue, batchInterval, disabled]);

  // Track metric
  const track = useCallback((
    name: string,
    value?: number,
    tags?: Record<string, string>
  ) => {
    if (disabled || Math.random() > sampleRate) return;

    setQueue(prev => [...prev, {
      name,
      value,
      tags,
      timestamp: Date.now(),
    }]);

    if (queue.length >= batchSize) {
      processQueue();
    }
  }, [disabled, sampleRate, batchSize, processQueue, queue.length]);

  // Track timing
  const trackTiming = useCallback((name: string, tags?: Record<string, string>) => {
    const startTime = Date.now();
    
    return () => {
      const duration = Date.now() - startTime;
      track(name, duration, tags);
    };
  }, [track]);

  // Track error
  const trackError = useCallback((
    error: Error,
    tags?: Record<string, string>
  ) => {
    track('error', undefined, {
      ...tags,
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  }, [track]);

  // Get queue stats
  const getStats = useCallback(() => ({
    queueLength: queue.length,
    failedBatches: failedBatchesRef.current.length,
    isProcessing,
  }), [queue.length, isProcessing]);

  // Clear queue
  const clearQueue = useCallback(() => {
    setQueue([]);
    failedBatchesRef.current = [];
  }, []);

  return {
    track,
    trackTiming,
    trackError,
    getStats,
    clearQueue,
  };
}

// Helper hook for performance metrics
export function usePerformanceMetrics(options?: Omit<UseMetricsOptions, 'transform'>) {
  const metrics = useMetrics({
    ...options,
    transform: (events) => events.map(event => ({
      ...event,
      tags: {
        ...event.tags,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
      },
    })),
  });

  // Track page load time
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timing = window.performance.timing;
    const loadTime = timing.loadEventEnd - timing.navigationStart;
    const dnsTime = timing.domainLookupEnd - timing.domainLookupStart;
    const tcpTime = timing.connectEnd - timing.connectStart;
    const ttfb = timing.responseStart - timing.navigationStart;

    metrics.track('page_load', loadTime, { type: 'load' });
    metrics.track('dns_lookup', dnsTime, { type: 'dns' });
    metrics.track('tcp_connection', tcpTime, { type: 'tcp' });
    metrics.track('ttfb', ttfb, { type: 'response' });
  }, [metrics]);

  // Track memory usage
  useEffect(() => {
    if (typeof window === 'undefined' || !('memory' in window.performance)) return;

    const interval = setInterval(() => {
      const memory = (performance as any).memory;
      metrics.track('memory_usage', memory.usedJSHeapSize, {
        total: String(memory.totalJSHeapSize),
        limit: String(memory.jsHeapSizeLimit),
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [metrics]);

  return metrics;
}

// Helper hook for user interaction metrics
export function useInteractionMetrics(options?: UseMetricsOptions) {
  const metrics = useMetrics(options);

  // Track user interactions
  useEffect(() => {
    const trackInteraction = (event: MouseEvent | KeyboardEvent) => {
      metrics.track('user_interaction', undefined, {
        type: event.type,
        target: (event.target as HTMLElement).tagName.toLowerCase(),
      });
    };

    window.addEventListener('click', trackInteraction);
    window.addEventListener('keypress', trackInteraction);

    return () => {
      window.removeEventListener('click', trackInteraction);
      window.removeEventListener('keypress', trackInteraction);
    };
  }, [metrics]);

  return metrics;
}
