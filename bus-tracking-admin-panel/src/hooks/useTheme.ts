'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { useMedia } from './useMedia';

type Theme = 'light' | 'dark' | 'system';
type ColorScheme = 'light' | 'dark';

interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  error: string;
  warning: string;
  success: string;
  info: string;
}

interface ThemeConfig {
  light: ThemeColors;
  dark: ThemeColors;
}

interface UseThemeOptions {
  defaultTheme?: Theme;
  storageKey?: string;
  themeConfig?: ThemeConfig;
  onChange?: (theme: Theme, colors: ThemeColors) => void;
  onError?: (error: Error) => void;
}

const defaultThemeConfig: ThemeConfig = {
  light: {
    primary: '#007AFF',
    secondary: '#5856D6',
    background: '#FFFFFF',
    surface: '#F2F2F7',
    text: '#000000',
    error: '#FF3B30',
    warning: '#FF9500',
    success: '#34C759',
    info: '#5856D6',
  },
  dark: {
    primary: '#0A84FF',
    secondary: '#5E5CE6',
    background: '#000000',
    surface: '#1C1C1E',
    text: '#FFFFFF',
    error: '#FF453A',
    warning: '#FF9F0A',
    success: '#32D74B',
    info: '#5E5CE6',
  },
};

export function useTheme({
  defaultTheme = 'system',
  storageKey = 'theme-preference',
  themeConfig = defaultThemeConfig,
  onChange,
  onError,
}: UseThemeOptions = {}) {
  const prefersDark = useMedia('(prefers-color-scheme: dark)');
  const [theme, setTheme] = useLocalStorage<Theme>(storageKey, defaultTheme);
  const [colors, setColors] = useState<ThemeColors>(
    theme === 'system'
      ? prefersDark
        ? themeConfig.dark
        : themeConfig.light
      : themeConfig[theme]
  );

  // Get current color scheme based on theme preference
  const getCurrentColorScheme = useCallback((): ColorScheme => {
    if (theme === 'system') {
      return prefersDark ? 'dark' : 'light';
    }
    return theme;
  }, [theme, prefersDark]);

  // Update theme
  const updateTheme = useCallback((newTheme: Theme) => {
    try {
      setTheme(newTheme);
      const newColors = newTheme === 'system'
        ? prefersDark
          ? themeConfig.dark
          : themeConfig.light
        : themeConfig[newTheme];
      setColors(newColors);
      onChange?.(newTheme, newColors);

      // Update CSS variables
      Object.entries(newColors).forEach(([key, value]) => {
        document.documentElement.style.setProperty(`--color-${key}`, value);
      });

      // Update color-scheme meta tag
      const colorScheme = getCurrentColorScheme();
      document.documentElement.style.colorScheme = colorScheme;

      // Update theme-color meta tag
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute(
          'content',
          colorScheme === 'dark' ? themeConfig.dark.background : themeConfig.light.background
        );
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Failed to update theme'));
    }
  }, [theme, prefersDark, themeConfig, setTheme, onChange, onError, getCurrentColorScheme]);

  // Toggle between light and dark themes
  const toggleTheme = useCallback(() => {
    const currentScheme = getCurrentColorScheme();
    updateTheme(currentScheme === 'light' ? 'dark' : 'light');
  }, [getCurrentColorScheme, updateTheme]);

  // Update colors when system preference changes
  useEffect(() => {
    if (theme === 'system') {
      updateTheme('system');
    }
  }, [prefersDark, theme, updateTheme]);

  // Initialize theme on mount
  useEffect(() => {
    updateTheme(theme);
  }, [theme, updateTheme]);

  // Get color with optional opacity
  const getColor = useCallback((
    colorKey: keyof ThemeColors,
    opacity?: number
  ): string => {
    const color = colors[colorKey];
    if (!opacity || opacity >= 1) return color;

    // Convert hex to rgba if opacity is provided
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return color;
  }, [colors]);

  // Check if current theme is dark
  const isDarkMode = useCallback((): boolean => {
    return getCurrentColorScheme() === 'dark';
  }, [getCurrentColorScheme]);

  return {
    theme,
    colors,
    colorScheme: getCurrentColorScheme(),
    isDarkMode: isDarkMode(),
    setTheme: updateTheme,
    toggleTheme,
    getColor,
  };
}

// Helper hook for managing color palette
interface ColorPaletteOptions {
  baseColor: string;
  darkMode?: boolean;
}

export function useColorPalette({
  baseColor,
  darkMode = false,
}: ColorPaletteOptions) {
  // Convert hex to HSL
  const hexToHSL = useCallback((hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }

    return [h * 360, s * 100, l * 100];
  }, []);

  // Convert HSL to hex
  const hslToHex = useCallback((h: number, s: number, l: number): string => {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }, []);

  // Generate color palette
  const generatePalette = useCallback(() => {
    const [h, s, l] = hexToHSL(baseColor);
    const palette: Record<number, string> = {};

    const steps = darkMode ? [90, 80, 70, 60, 50, 40, 30, 20, 10] : [10, 20, 30, 40, 50, 60, 70, 80, 90];

    steps.forEach((step, index) => {
      palette[(index + 1) * 100] = hslToHex(h, s, step);
    });

    return palette;
  }, [baseColor, darkMode, hexToHSL, hslToHex]);

  return {
    palette: generatePalette(),
    generatePalette,
  };
}
