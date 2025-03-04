'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useReducedMotion } from './useMedia';

interface AnimationOptions {
  duration?: number;
  delay?: number;
  easing?: string;
  iterations?: number;
  direction?: PlaybackDirection;
  fill?: FillMode;
  onStart?: () => void;
  onComplete?: () => void;
  onCancel?: () => void;
}

interface TransitionOptions {
  property?: string;
  duration?: number;
  delay?: number;
  easing?: string;
  onTransitionEnd?: () => void;
}

interface SpringOptions {
  stiffness?: number;
  damping?: number;
  mass?: number;
  velocity?: number;
}

export function useAnimation(keyframes: Keyframe[], options: AnimationOptions = {}) {
  const elementRef = useRef<HTMLElement | null>(null);
  const animationRef = useRef<Animation | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const animate = useCallback((element: HTMLElement) => {
    if (prefersReducedMotion) {
      options.onComplete?.();
      return null;
    }

    const animation = element.animate(keyframes, {
      duration: options.duration || 1000,
      delay: options.delay || 0,
      easing: options.easing || 'ease',
      iterations: options.iterations || 1,
      direction: options.direction || 'normal',
      fill: options.fill || 'none',
    });

    animation.onfinish = () => {
      setIsPlaying(false);
      options.onComplete?.();
    };

    animation.oncancel = () => {
      setIsPlaying(false);
      options.onCancel?.();
    };

    return animation;
  }, [keyframes, options, prefersReducedMotion]);

  const play = useCallback(() => {
    if (!elementRef.current) return;

    options.onStart?.();
    animationRef.current = animate(elementRef.current);
    
    if (animationRef.current) {
      animationRef.current.playbackRate = playbackRate;
      setIsPlaying(true);
    }
  }, [animate, options, playbackRate]);

  const pause = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const resume = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.play();
      setIsPlaying(true);
    }
  }, []);

  const cancel = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.cancel();
      setIsPlaying(false);
      options.onCancel?.();
    }
  }, [options]);

  const finish = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.finish();
      setIsPlaying(false);
      options.onComplete?.();
    }
  }, [options]);

  const setTime = useCallback((time: number) => {
    if (animationRef.current) {
      animationRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const setRate = useCallback((rate: number) => {
    if (animationRef.current) {
      animationRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        animationRef.current.cancel();
      }
    };
  }, []);

  return {
    ref: elementRef,
    isPlaying,
    currentTime,
    playbackRate,
    play,
    pause,
    resume,
    cancel,
    finish,
    setTime,
    setRate,
  };
}

export function useTransition(options: TransitionOptions = {}) {
  const elementRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const [isTransitioning, setIsTransitioning] = useState(false);

  const startTransition = useCallback((from: string, to: string) => {
    const element = elementRef.current;
    if (!element || prefersReducedMotion) {
      options.onTransitionEnd?.();
      return;
    }

    const {
      property = 'all',
      duration = 300,
      delay = 0,
      easing = 'ease',
    } = options;

    element.style.transition = `${property} ${duration}ms ${easing} ${delay}ms`;
    
    // Force reflow
    element.offsetHeight;

    // Apply the 'to' styles
    Object.assign(element.style, typeof to === 'string' ? { [property]: to } : to);
    
    setIsTransitioning(true);

    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target === element) {
        element.removeEventListener('transitionend', handleTransitionEnd);
        setIsTransitioning(false);
        options.onTransitionEnd?.();
      }
    };

    element.addEventListener('transitionend', handleTransitionEnd);
  }, [options, prefersReducedMotion]);

  return {
    ref: elementRef,
    isTransitioning,
    startTransition,
  };
}

export function useSpring(
  targetValue: number,
  {
    stiffness = 170,
    damping = 26,
    mass = 1,
    velocity = 0,
  }: SpringOptions = {}
) {
  const [value, setValue] = useState(targetValue);
  const [isAnimating, setIsAnimating] = useState(false);
  const frameRef = useRef<number>();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      setValue(targetValue);
      return;
    }

    let currentVelocity = velocity;
    let currentValue = value;
    let lastTime = performance.now();

    const animate = () => {
      const now = performance.now();
      const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap at 100ms
      lastTime = now;

      const spring = stiffness * (targetValue - currentValue);
      const damper = damping * currentVelocity;
      const acceleration = (spring - damper) / mass;

      currentVelocity += acceleration * deltaTime;
      currentValue += currentVelocity * deltaTime;

      setValue(currentValue);

      // Check if spring has settled
      const isSettled = Math.abs(currentVelocity) < 0.01 && 
        Math.abs(targetValue - currentValue) < 0.01;

      if (isSettled) {
        setValue(targetValue);
        setIsAnimating(false);
      } else {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    setIsAnimating(true);
    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [
    targetValue,
    stiffness,
    damping,
    mass,
    velocity,
    value,
    prefersReducedMotion,
  ]);

  return {
    value,
    isAnimating,
  };
}

// Helper hook for CSS keyframe animations
export function useCSSAnimation(
  animationName: string,
  options: Omit<AnimationOptions, 'onStart' | 'onComplete' | 'onCancel'> = {}
) {
  const elementRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const element = elementRef.current;
    if (!element || prefersReducedMotion) return;

    const {
      duration = 1000,
      delay = 0,
      easing = 'ease',
      iterations = 1,
      direction = 'normal',
      fill = 'none',
    } = options;

    element.style.animation = `${animationName} ${duration}ms ${easing} ${delay}ms ${iterations} ${direction} ${fill}`;

    return () => {
      element.style.animation = '';
    };
  }, [animationName, options, prefersReducedMotion]);

  return elementRef;
}
