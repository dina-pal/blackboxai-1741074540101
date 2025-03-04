'use client';

import { useState, useEffect, useCallback } from 'react';

interface OrientationData {
  alpha: number | null; // z-axis rotation [0-360]
  beta: number | null;  // x-axis rotation [-180,180]
  gamma: number | null; // y-axis rotation [-90,90]
  absolute: boolean;
}

interface MotionData {
  acceleration: {
    x: number | null;
    y: number | null;
    z: number | null;
  };
  accelerationIncludingGravity: {
    x: number | null;
    y: number | null;
    z: number | null;
  };
  rotationRate: {
    alpha: number | null;
    beta: number | null;
    gamma: number | null;
  };
  interval: number | null;
}

interface SensorOptions {
  frequency?: number;
  onOrientationChange?: (data: OrientationData) => void;
  onMotionChange?: (data: MotionData) => void;
  onError?: (error: Error) => void;
}

interface UseSensorsReturn {
  orientation: OrientationData;
  motion: MotionData;
  isOrientationAvailable: boolean;
  isMotionAvailable: boolean;
  error: Error | null;
  requestPermission: () => Promise<PermissionState>;
}

const defaultOrientation: OrientationData = {
  alpha: null,
  beta: null,
  gamma: null,
  absolute: false,
};

const defaultMotion: MotionData = {
  acceleration: { x: null, y: null, z: null },
  accelerationIncludingGravity: { x: null, y: null, z: null },
  rotationRate: { alpha: null, beta: null, gamma: null },
  interval: null,
};

export function useSensors({
  frequency = 60,
  onOrientationChange,
  onMotionChange,
  onError,
}: SensorOptions = {}): UseSensorsReturn {
  const [orientation, setOrientation] = useState<OrientationData>(defaultOrientation);
  const [motion, setMotion] = useState<MotionData>(defaultMotion);
  const [error, setError] = useState<Error | null>(null);

  const isOrientationAvailable = typeof window !== 'undefined' && 
    'DeviceOrientationEvent' in window;
  const isMotionAvailable = typeof window !== 'undefined' && 
    'DeviceMotionEvent' in window;

  // Handle device orientation changes
  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const data: OrientationData = {
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      absolute: event.absolute,
    };
    setOrientation(data);
    onOrientationChange?.(data);
  }, [onOrientationChange]);

  // Handle device motion changes
  const handleMotion = useCallback((event: DeviceMotionEvent) => {
    const data: MotionData = {
      acceleration: {
        x: event.acceleration?.x ?? null,
        y: event.acceleration?.y ?? null,
        z: event.acceleration?.z ?? null,
      },
      accelerationIncludingGravity: {
        x: event.accelerationIncludingGravity?.x ?? null,
        y: event.accelerationIncludingGravity?.y ?? null,
        z: event.accelerationIncludingGravity?.z ?? null,
      },
      rotationRate: {
        alpha: event.rotationRate?.alpha ?? null,
        beta: event.rotationRate?.beta ?? null,
        gamma: event.rotationRate?.gamma ?? null,
      },
      interval: event.interval,
    };
    setMotion(data);
    onMotionChange?.(data);
  }, [onMotionChange]);

  // Handle errors
  const handleError = useCallback((error: Error) => {
    setError(error);
    onError?.(error);
  }, [onError]);

  // Request permission to use sensors
  const requestPermission = useCallback(async (): Promise<PermissionState> => {
    if (!isOrientationAvailable && !isMotionAvailable) {
      throw new Error('Device sensors are not available');
    }

    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          'requestPermission' in DeviceOrientationEvent) {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        return permission;
      }
      return 'granted';
    } catch (error) {
      handleError(error instanceof Error ? error : new Error('Failed to request permission'));
      return 'denied';
    }
  }, [handleError, isOrientationAvailable, isMotionAvailable]);

  // Set up event listeners
  useEffect(() => {
    if (!isOrientationAvailable && !isMotionAvailable) {
      handleError(new Error('Device sensors are not available'));
      return;
    }

    let orientationInterval: NodeJS.Timeout;
    let motionInterval: NodeJS.Timeout;

    const setupListeners = async () => {
      try {
        const permission = await requestPermission();
        if (permission === 'granted') {
          if (isOrientationAvailable) {
            window.addEventListener('deviceorientation', handleOrientation);
            orientationInterval = setInterval(() => {
              // Trigger orientation update at specified frequency
            }, 1000 / frequency);
          }

          if (isMotionAvailable) {
            window.addEventListener('devicemotion', handleMotion);
            motionInterval = setInterval(() => {
              // Trigger motion update at specified frequency
            }, 1000 / frequency);
          }
        } else {
          handleError(new Error('Permission to use device sensors was denied'));
        }
      } catch (error) {
        handleError(error instanceof Error ? error : new Error('Failed to set up sensors'));
      }
    };

    setupListeners();

    return () => {
      if (isOrientationAvailable) {
        window.removeEventListener('deviceorientation', handleOrientation);
        clearInterval(orientationInterval);
      }
      if (isMotionAvailable) {
        window.removeEventListener('devicemotion', handleMotion);
        clearInterval(motionInterval);
      }
    };
  }, [
    frequency,
    handleOrientation,
    handleMotion,
    handleError,
    requestPermission,
    isOrientationAvailable,
    isMotionAvailable,
  ]);

  return {
    orientation,
    motion,
    isOrientationAvailable,
    isMotionAvailable,
    error,
    requestPermission,
  };
}

// Helper hook for compass functionality
export function useCompass() {
  const { orientation, isOrientationAvailable, error, requestPermission } = useSensors();
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    if (orientation.alpha !== null) {
      setHeading(orientation.alpha);
    }
  }, [orientation.alpha]);

  return {
    heading,
    isAvailable: isOrientationAvailable,
    error,
    requestPermission,
  };
}

// Helper hook for step counter
export function useStepCounter() {
  const { motion, isMotionAvailable, error, requestPermission } = useSensors();
  const [steps, setSteps] = useState(0);
  const [isWalking, setIsWalking] = useState(false);

  useEffect(() => {
    const acceleration = motion.accelerationIncludingGravity;
    if (acceleration.x !== null && acceleration.y !== null && acceleration.z !== null) {
      const magnitude = Math.sqrt(
        acceleration.x ** 2 + 
        acceleration.y ** 2 + 
        acceleration.z ** 2
      );

      // Simple step detection threshold
      const walkingThreshold = 12;
      const isCurrentlyWalking = magnitude > walkingThreshold;

      if (isCurrentlyWalking && !isWalking) {
        setSteps(prev => prev + 1);
      }
      setIsWalking(isCurrentlyWalking);
    }
  }, [motion, isWalking]);

  const resetSteps = useCallback(() => {
    setSteps(0);
  }, []);

  return {
    steps,
    isWalking,
    isAvailable: isMotionAvailable,
    error,
    requestPermission,
    resetSteps,
  };
}
