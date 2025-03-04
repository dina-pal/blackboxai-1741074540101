'use client';

import { useState, useEffect, useCallback } from 'react';
import { BREAKPOINTS } from '@/lib/constants';

type MediaQueryObject = {
  [key: string]: string | number | boolean;
};

type MediaQueryString = string;

interface UseMediaOptions {
  defaultValue?: boolean;
  debounceTime?: number;
}

interface UseMediaQueryReturn {
  matches: boolean;
  media: string;
}

// Convert media query object to string
function mediaQueryObjectToString(query: MediaQueryObject): string {
  return Object.entries(query)
    .map(([feature, value]) => {
      if (typeof value === 'boolean') {
        return value ? feature : `not ${feature}`;
      }
      return `(${feature}: ${value})`;
    })
    .join(' and ');
}

// Create media query string
function createMediaQueryString(
  query: MediaQueryString | MediaQueryObject | number
): string {
  if (typeof query === 'string') return query;
  if (typeof query === 'number') return `(min-width: ${query}px)`;
  return mediaQueryObjectToString(query);
}

export function useMedia(
  query: MediaQueryString | MediaQueryObject | number,
  { defaultValue = false, debounceTime = 200 }: UseMediaOptions = {}
): boolean {
  const [matches, setMatches] = useState(defaultValue);
  const mediaQuery = createMediaQueryString(query);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId: NodeJS.Timeout;
    const mql = window.matchMedia(mediaQuery);

    const handleChange = () => {
      if (debounceTime > 0) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setMatches(mql.matches);
        }, debounceTime);
      } else {
        setMatches(mql.matches);
      }
    };

    setMatches(mql.matches);

    try {
      mql.addEventListener('change', handleChange);
    } catch (e) {
      // Fallback for older browsers
      mql.addListener(handleChange);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      try {
        mql.removeEventListener('change', handleChange);
      } catch (e) {
        // Fallback for older browsers
        mql.removeListener(handleChange);
      }
    };
  }, [mediaQuery, debounceTime]);

  return matches;
}

// Helper hook for breakpoint queries
type Breakpoint = keyof typeof BREAKPOINTS;

export function useBreakpoint(breakpoint: Breakpoint): boolean {
  return useMedia(`(min-width: ${BREAKPOINTS[breakpoint]}px)`);
}

// Helper hook for multiple breakpoints
export function useBreakpoints(): Record<Breakpoint, boolean> {
  const breakpoints = Object.keys(BREAKPOINTS) as Breakpoint[];
  const matches: Partial<Record<Breakpoint, boolean>> = {};

  breakpoints.forEach((breakpoint) => {
    matches[breakpoint] = useBreakpoint(breakpoint);
  });

  return matches as Record<Breakpoint, boolean>;
}

// Helper hook for orientation
type Orientation = 'portrait' | 'landscape';

export function useOrientation(): Orientation {
  const isPortrait = useMedia('(orientation: portrait)');
  return isPortrait ? 'portrait' : 'landscape';
}

// Helper hook for dark mode
export function useDarkMode(defaultValue = false): [boolean, () => void] {
  const prefersDark = useMedia('(prefers-color-scheme: dark)', {
    defaultValue,
  });

  const [isDark, setIsDark] = useState(
    typeof window !== 'undefined'
      ? localStorage.getItem('darkMode') === 'true'
      : defaultValue
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('darkMode', String(isDark));
  }, [isDark]);

  const toggle = useCallback(() => {
    setIsDark(prev => !prev);
  }, []);

  // Update dark mode if system preference changes and no manual selection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('darkMode') === null) {
      setIsDark(prefersDark);
    }
  }, [prefersDark]);

  return [isDark, toggle];
}

// Helper hook for reduced motion
export function useReducedMotion(): boolean {
  return useMedia('(prefers-reduced-motion: reduce)');
}

// Helper hook for high contrast
export function useHighContrast(): boolean {
  return useMedia('(prefers-contrast: high)');
}

// Helper hook for multiple media queries
export function useMediaQueries(
  queries: Record<string, MediaQueryString | MediaQueryObject | number>
): Record<string, boolean> {
  const result: Record<string, boolean> = {};

  Object.entries(queries).forEach(([key, query]) => {
    result[key] = useMedia(query);
  });

  return result;
}

// Helper hook for responsive values
export function useResponsiveValue<T>(
  values: Partial<Record<Breakpoint, T>>,
  defaultValue: T
): T {
  const breakpoints = useBreakpoints();
  const breakpointEntries = Object.entries(BREAKPOINTS) as [Breakpoint, number][];

  // Sort breakpoints from largest to smallest
  const sortedBreakpoints = breakpointEntries
    .sort(([, a], [, b]) => b - a)
    .map(([name]) => name);

  // Find the first matching breakpoint with a defined value
  for (const breakpoint of sortedBreakpoints) {
    if (breakpoints[breakpoint] && values[breakpoint] !== undefined) {
      return values[breakpoint]!;
    }
  }

  return defaultValue;
}
