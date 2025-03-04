'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface GeolocationOptions extends Partial<PositionOptions> {
  onSuccess?: (position: GeolocationPosition) => void;
  onError?: (error: GeolocationError) => void;
  onWatchError?: (error: GeolocationError) => void;
}

interface GeolocationState {
  position: GeolocationPosition | null;
  error: GeolocationError | null;
  isLoading: boolean;
}

interface GeolocationError extends Error {
  code: number;
  PERMISSION_DENIED: number;
  POSITION_UNAVAILABLE: number;
  TIMEOUT: number;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface UseGeolocationReturn extends GeolocationState {
  getCurrentPosition: () => Promise<GeolocationPosition>;
  startWatching: () => void;
  stopWatching: () => void;
  isWatching: boolean;
}

const defaultOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 10000,
};

export function useGeolocation({
  enableHighAccuracy = true,
  maximumAge = 0,
  timeout = 10000,
  onSuccess,
  onError,
  onWatchError,
}: GeolocationOptions = {}): UseGeolocationReturn {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: null,
    isLoading: true,
  });
  const [isWatching, setIsWatching] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // Check if geolocation is supported
  const isGeolocationSupported = typeof window !== 'undefined' && 'geolocation' in navigator;

  // Handle successful position update
  const handleSuccess = useCallback((position: GeolocationPosition) => {
    setState({
      position,
      error: null,
      isLoading: false,
    });
    onSuccess?.(position);
  }, [onSuccess]);

  // Handle geolocation errors
  const handleError = useCallback((error: GeolocationError, isWatchError = false) => {
    setState(prev => ({
      ...prev,
      error,
      isLoading: false,
    }));
    if (isWatchError) {
      onWatchError?.(error);
    } else {
      onError?.(error);
    }
  }, [onError, onWatchError]);

  // Get current position
  const getCurrentPosition = useCallback((): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!isGeolocationSupported) {
        const error = new Error('Geolocation is not supported') as GeolocationError;
        error.code = 0;
        reject(error);
        return;
      }

      setState(prev => ({ ...prev, isLoading: true }));

      navigator.geolocation.getCurrentPosition(
        (position) => {
          handleSuccess(position);
          resolve(position);
        },
        (error) => {
          handleError(error as GeolocationError);
          reject(error);
        },
        {
          enableHighAccuracy,
          maximumAge,
          timeout,
        }
      );
    });
  }, [enableHighAccuracy, maximumAge, timeout, handleSuccess, handleError]);

  // Start watching position
  const startWatching = useCallback(() => {
    if (!isGeolocationSupported || watchIdRef.current !== null) return;

    const watchId = navigator.geolocation.watchPosition(
      handleSuccess,
      (error) => handleError(error as GeolocationError, true),
      {
        enableHighAccuracy,
        maximumAge,
        timeout,
      }
    );

    watchIdRef.current = watchId;
    setIsWatching(true);
  }, [enableHighAccuracy, maximumAge, timeout, handleSuccess, handleError]);

  // Stop watching position
  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setIsWatching(false);
    }
  }, []);

  // Get initial position
  useEffect(() => {
    getCurrentPosition().catch(() => {});
    return () => {
      stopWatching();
    };
  }, [getCurrentPosition, stopWatching]);

  return {
    ...state,
    getCurrentPosition,
    startWatching,
    stopWatching,
    isWatching,
  };
}

// Helper hook for distance calculations
interface UseDistanceOptions {
  unit?: 'km' | 'mi';
}

export function useDistance({ unit = 'km' }: UseDistanceOptions = {}) {
  // Calculate distance between two points using Haversine formula
  const calculateDistance = useCallback((
    point1: Coordinates,
    point2: Coordinates
  ): number => {
    const R = unit === 'km' ? 6371 : 3959; // Earth's radius in km or miles
    const dLat = toRad(point2.latitude - point1.latitude);
    const dLon = toRad(point2.longitude - point1.longitude);
    const lat1 = toRad(point1.latitude);
    const lat2 = toRad(point2.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, [unit]);

  // Calculate bearing between two points
  const calculateBearing = useCallback((
    point1: Coordinates,
    point2: Coordinates
  ): number => {
    const dLon = toRad(point2.longitude - point1.longitude);
    const lat1 = toRad(point1.latitude);
    const lat2 = toRad(point2.latitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = toDeg(Math.atan2(y, x));
    return (bearing + 360) % 360;
  }, []);

  // Check if point is within radius
  const isWithinRadius = useCallback((
    center: Coordinates,
    point: Coordinates,
    radius: number
  ): boolean => {
    const distance = calculateDistance(center, point);
    return distance <= radius;
  }, [calculateDistance]);

  // Convert degrees to radians
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

  // Convert radians to degrees
  const toDeg = (radians: number): number => (radians * 180) / Math.PI;

  return {
    calculateDistance,
    calculateBearing,
    isWithinRadius,
  };
}

// Helper hook for location history
interface UseLocationHistoryOptions {
  maxEntries?: number;
}

export function useLocationHistory({
  maxEntries = 10,
}: UseLocationHistoryOptions = {}) {
  const [history, setHistory] = useState<GeolocationPosition[]>([]);

  const addLocation = useCallback((position: GeolocationPosition) => {
    setHistory(prev => {
      const newHistory = [position, ...prev];
      return newHistory.slice(0, maxEntries);
    });
  }, [maxEntries]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    history,
    addLocation,
    clearHistory,
  };
}
