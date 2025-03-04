'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

interface PreferenceConfig<T> {
  key: keyof T;
  label: string;
  description?: string;
  type: 'boolean' | 'string' | 'number' | 'select' | 'object';
  default: T[keyof T];
  options?: Array<{ label: string; value: any }>;
  validate?: (value: T[keyof T]) => boolean;
  category?: string;
  dependencies?: Array<keyof T>;
  onChange?: (value: T[keyof T], preferences: T) => void;
}

interface UsePreferencesOptions<T> {
  storageKey?: string;
  config: PreferenceConfig<T>[];
  initialPreferences?: Partial<T>;
  onError?: (error: Error) => void;
  onChange?: (preferences: T) => void;
  migrate?: (oldPreferences: any) => T;
  version?: number;
}

interface PreferenceError extends Error {
  key: string;
  value: any;
}

export function usePreferences<T extends Record<string, any>>({
  storageKey = 'app-preferences',
  config,
  initialPreferences = {} as T,
  onError,
  onChange,
  migrate,
  version = 1,
}: UsePreferencesOptions<T>) {
  // Create initial state from config defaults and initial preferences
  const getInitialState = (): T => {
    const defaults = config.reduce((acc, { key, default: defaultValue }) => ({
      ...acc,
      [key]: defaultValue,
    }), {});
    return { ...defaults, ...initialPreferences } as T;
  };

  const [preferences, setPreferences] = useLocalStorage<T & { _version?: number }>(
    storageKey,
    getInitialState()
  );

  const [errors, setErrors] = useState<Record<keyof T, string>>({} as Record<keyof T, string>);
  const [isLoading, setIsLoading] = useState(true);

  // Validate a single preference
  const validatePreference = useCallback((
    key: keyof T,
    value: T[keyof T]
  ): boolean => {
    const prefConfig = config.find(c => c.key === key);
    if (!prefConfig) return true;

    // Type validation
    if (prefConfig.type === 'boolean' && typeof value !== 'boolean') {
      throw new Error(`Preference ${String(key)} must be a boolean`);
    }
    if (prefConfig.type === 'number' && typeof value !== 'number') {
      throw new Error(`Preference ${String(key)} must be a number`);
    }
    if (prefConfig.type === 'string' && typeof value !== 'string') {
      throw new Error(`Preference ${String(key)} must be a string`);
    }
    if (prefConfig.type === 'select' && !prefConfig.options?.some(opt => opt.value === value)) {
      throw new Error(`Invalid value for preference ${String(key)}`);
    }

    // Custom validation
    if (prefConfig.validate && !prefConfig.validate(value)) {
      throw new Error(`Validation failed for preference ${String(key)}`);
    }

    return true;
  }, [config]);

  // Update a single preference
  const setPreference = useCallback(<K extends keyof T>(
    key: K,
    value: T[K]
  ) => {
    try {
      validatePreference(key, value);

      setPreferences(prev => {
        const newPreferences = { ...prev, [key]: value };

        // Check dependencies
        const prefConfig = config.find(c => c.key === key);
        if (prefConfig?.dependencies) {
          prefConfig.dependencies.forEach(depKey => {
            const depConfig = config.find(c => c.key === depKey);
            if (depConfig?.validate) {
              try {
                validatePreference(depKey, newPreferences[depKey]);
              } catch (error) {
                throw new Error(`Dependency validation failed: ${error.message}`);
              }
            }
          });
        }

        // Call individual preference onChange handler
        prefConfig?.onChange?.(value, newPreferences);

        // Call global onChange handler
        onChange?.(newPreferences);

        return newPreferences;
      });

      // Clear error for this preference
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    } catch (error) {
      const prefError = error as PreferenceError;
      prefError.key = String(key);
      prefError.value = value;
      setErrors(prev => ({
        ...prev,
        [key]: prefError.message,
      }));
      onError?.(prefError);
    }
  }, [config, setPreferences, validatePreference, onChange, onError]);

  // Reset preferences to defaults
  const resetPreferences = useCallback(() => {
    const defaults = getInitialState();
    setPreferences({ ...defaults, _version: version });
    setErrors({} as Record<keyof T, string>);
  }, [version, setPreferences]);

  // Reset a single preference to default
  const resetPreference = useCallback((key: keyof T) => {
    const prefConfig = config.find(c => c.key === key);
    if (prefConfig) {
      setPreference(key, prefConfig.default);
    }
  }, [config, setPreference]);

  // Get preferences by category
  const getPreferencesByCategory = useCallback(() => {
    const categories = new Map<string, PreferenceConfig<T>[]>();
    
    config.forEach(pref => {
      const category = pref.category || 'General';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(pref);
    });

    return Object.fromEntries(categories);
  }, [config]);

  // Import preferences
  const importPreferences = useCallback((newPreferences: Partial<T>) => {
    try {
      // Validate all new preferences
      Object.entries(newPreferences).forEach(([key, value]) => {
        validatePreference(key as keyof T, value);
      });

      setPreferences(prev => ({
        ...prev,
        ...newPreferences,
        _version: version,
      }));
      setErrors({} as Record<keyof T, string>);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Import failed'));
    }
  }, [version, setPreferences, validatePreference, onError]);

  // Export preferences
  const exportPreferences = useCallback(() => {
    const { _version, ...prefsWithoutVersion } = preferences;
    return prefsWithoutVersion;
  }, [preferences]);

  // Handle version migration
  useEffect(() => {
    if (preferences._version !== version && migrate) {
      try {
        const migratedPreferences = migrate(preferences);
        setPreferences({ ...migratedPreferences, _version: version });
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('Migration failed'));
      }
    }
    setIsLoading(false);
  }, [preferences, version, migrate, setPreferences, onError]);

  return {
    preferences,
    setPreference,
    resetPreferences,
    resetPreference,
    errors,
    isLoading,
    getPreferencesByCategory,
    importPreferences,
    exportPreferences,
    config,
  };
}

// Helper hook for managing feature flags
export function useFeatureFlags<T extends Record<string, boolean>>(
  flags: T,
  options?: Omit<UsePreferencesOptions<T>, 'config'>
) {
  const config: PreferenceConfig<T>[] = Object.entries(flags).map(([key, defaultValue]) => ({
    key: key as keyof T,
    label: key,
    type: 'boolean',
    default: defaultValue,
  }));

  const { preferences, setPreference } = usePreferences({
    ...options,
    config,
    storageKey: 'feature-flags',
  });

  const isEnabled = useCallback((flag: keyof T) => {
    return preferences[flag] ?? flags[flag];
  }, [preferences, flags]);

  return {
    flags: preferences,
    isEnabled,
    setFlag: setPreference,
  };
}
