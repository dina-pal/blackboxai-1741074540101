'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEventListener } from './useEventListener';

interface NetworkState {
  online: boolean;
  since: Date | null;
  downlink: number | null;
  downlinkMax: number | null;
  effectiveType: string | null;
  rtt: number | null;
  saveData: boolean;
  type: string | null;
}

interface NetworkStats {
  latency: number;
  bandwidth: number;
  lastChecked: Date;
}

interface UseNetworkOptions {
  pingUrl?: string;
  pingInterval?: number;
  onStatusChange?: (online: boolean) => void;
  onTypeChange?: (type: string) => void;
  onLatencyChange?: (latency: number) => void;
}

const defaultState: NetworkState = {
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  since: null,
  downlink: null,
  downlinkMax: null,
  effectiveType: null,
  rtt: null,
  saveData: false,
  type: null,
};

export function useNetwork({
  pingUrl = 'https://www.google.com/favicon.ico',
  pingInterval = 30000,
  onStatusChange,
  onTypeChange,
  onLatencyChange,
}: UseNetworkOptions = {}) {
  const [state, setState] = useState<NetworkState>(defaultState);
  const [stats, setStats] = useState<NetworkStats>({
    latency: 0,
    bandwidth: 0,
    lastChecked: new Date(),
  });

  // Update connection information
  const updateConnectionInfo = useCallback(() => {
    if (typeof navigator === 'undefined') return;

    const connection = (navigator as any).connection ||
                      (navigator as any).mozConnection ||
                      (navigator as any).webkitConnection;

    if (connection) {
      setState(prev => ({
        ...prev,
        downlink: connection.downlink,
        downlinkMax: connection.downlinkMax,
        effectiveType: connection.effectiveType,
        rtt: connection.rtt,
        saveData: connection.saveData,
        type: connection.type,
      }));

      onTypeChange?.(connection.type);
    }
  }, [onTypeChange]);

  // Handle online status change
  const handleOnline = useCallback(() => {
    setState(prev => ({
      ...prev,
      online: true,
      since: new Date(),
    }));
    onStatusChange?.(true);
  }, [onStatusChange]);

  // Handle offline status change
  const handleOffline = useCallback(() => {
    setState(prev => ({
      ...prev,
      online: false,
      since: new Date(),
    }));
    onStatusChange?.(false);
  }, [onStatusChange]);

  // Measure network latency
  const measureLatency = useCallback(async (): Promise<number> => {
    const start = performance.now();
    try {
      await fetch(pingUrl, {
        mode: 'no-cors',
        cache: 'no-cache',
      });
      const end = performance.now();
      const latency = Math.round(end - start);
      onLatencyChange?.(latency);
      return latency;
    } catch (error) {
      return Infinity;
    }
  }, [pingUrl, onLatencyChange]);

  // Measure network bandwidth
  const measureBandwidth = useCallback(async (): Promise<number> => {
    const start = performance.now();
    try {
      const response = await fetch(pingUrl, { cache: 'no-cache' });
      const blob = await response.blob();
      const end = performance.now();
      const duration = (end - start) / 1000; // Convert to seconds
      const bitsLoaded = blob.size * 8;
      const bps = bitsLoaded / duration;
      const kbps = Math.round(bps / 1024);
      return kbps;
    } catch (error) {
      return 0;
    }
  }, [pingUrl]);

  // Update network stats
  const updateNetworkStats = useCallback(async () => {
    if (!state.online) return;

    const [latency, bandwidth] = await Promise.all([
      measureLatency(),
      measureBandwidth(),
    ]);

    setStats({
      latency,
      bandwidth,
      lastChecked: new Date(),
    });
  }, [state.online, measureLatency, measureBandwidth]);

  // Set up event listeners
  useEventListener('online', handleOnline);
  useEventListener('offline', handleOffline);
  useEventListener('change', updateConnectionInfo, (navigator as any).connection);

  // Initial connection info and periodic updates
  useEffect(() => {
    updateConnectionInfo();

    if (pingInterval > 0) {
      const intervalId = setInterval(updateNetworkStats, pingInterval);
      return () => clearInterval(intervalId);
    }
  }, [updateConnectionInfo, updateNetworkStats, pingInterval]);

  // Retry failed requests
  const retryRequest = useCallback(async <T>(
    request: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
  ): Promise<T> => {
    let lastError: Error | null = null;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await request();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Request failed');
        if (!state.online) {
          await new Promise(resolve => {
            const checkOnline = () => {
              if (state.online) {
                window.removeEventListener('online', checkOnline);
                resolve(undefined);
              }
            };
            window.addEventListener('online', checkOnline);
          });
        } else {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }, [state.online]);

  // Check if connection is metered
  const isMetered = useCallback((): boolean => {
    const connection = (navigator as any).connection;
    if (!connection) return false;
    return connection.saveData || 
           connection.type === 'cellular' || 
           connection.effectiveType === 'slow-2g' ||
           connection.effectiveType === '2g';
  }, []);

  return {
    ...state,
    stats,
    updateNetworkStats,
    retryRequest,
    isMetered,
  };
}

// Helper hook for handling offline-first functionality
interface UseOfflineFirstOptions {
  storage?: Storage;
  key?: string;
}

export function useOfflineFirst<T>({
  storage = localStorage,
  key = 'offline_data',
}: UseOfflineFirstOptions = {}) {
  const { online } = useNetwork();
  const [queue, setQueue] = useState<Array<() => Promise<T>>>([]);

  // Save data to storage
  const saveToStorage = useCallback((data: any) => {
    try {
      storage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save to storage:', error);
    }
  }, [storage, key]);

  // Load data from storage
  const loadFromStorage = useCallback((): any => {
    try {
      const data = storage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to load from storage:', error);
      return null;
    }
  }, [storage, key]);

  // Add request to queue
  const enqueue = useCallback((request: () => Promise<T>) => {
    setQueue(prev => [...prev, request]);
    return new Promise<void>((resolve) => {
      if (online) {
        processQueue();
        resolve();
      }
    });
  }, [online]);

  // Process queued requests
  const processQueue = useCallback(async () => {
    if (!online || queue.length === 0) return;

    const currentQueue = [...queue];
    setQueue([]);

    for (const request of currentQueue) {
      try {
        await request();
      } catch (error) {
        console.error('Failed to process queued request:', error);
        setQueue(prev => [...prev, request]);
      }
    }
  }, [online, queue]);

  // Process queue when coming online
  useEffect(() => {
    if (online) {
      processQueue();
    }
  }, [online, processQueue]);

  return {
    enqueue,
    isOnline: online,
    queueLength: queue.length,
    saveToStorage,
    loadFromStorage,
  };
}
