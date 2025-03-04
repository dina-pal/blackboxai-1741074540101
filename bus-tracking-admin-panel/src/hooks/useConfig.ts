'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

interface ConfigValue {
  value: any;
  source: 'default' | 'env' | 'override' | 'runtime';
  timestamp: number;
}

interface ConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'object';
    default?: any;
    validate?: (value: any) => boolean;
    transform?: (value: any) => any;
    required?: boolean;
    sensitive?: boolean;
  };
}

interface UseConfigOptions {
  schema: ConfigSchema;
  envPrefix?: string;
  storageKey?: string;
  onError?: (error: Error) => void;
  onChange?: (key: string, value: any, source: ConfigValue['source']) => void;
}

interface ConfigError extends Error {
  key: string;
  value: any;
  type: 'validation' | 'type' | 'required' | 'parse';
}

export function useConfig({
  schema,
  envPrefix = 'APP_',
  storageKey = 'app-config',
  onError,
  onChange,
}: UseConfigOptions) {
  const [config, setConfig] = useState<Record<string, ConfigValue>>({});
  const [errors, setErrors] = useState<Record<string, ConfigError>>({});
  const [overrides, setOverrides] = useLocalStorage<Record<string, any>>(
    storageKey,
    {}
  );

  // Validate and transform a single config value
  const validateValue = useCallback((
    key: string,
    value: any,
    schemaItem = schema[key]
  ): { value: any; error?: ConfigError } => {
    try {
      if (value === undefined && schemaItem.required) {
        throw Object.assign(new Error(`Config value ${key} is required`), {
          type: 'required',
        });
      }

      if (value !== undefined) {
        // Type validation
        switch (schemaItem.type) {
          case 'string':
            if (typeof value !== 'string') {
              value = String(value);
            }
            break;
          case 'number':
            if (typeof value !== 'number') {
              const num = Number(value);
              if (isNaN(num)) {
                throw Object.assign(new Error(`Invalid number value for ${key}`), {
                  type: 'type',
                });
              }
              value = num;
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              value = value === 'true' || value === '1' || value === 1;
            }
            break;
          case 'object':
            if (typeof value === 'string') {
              try {
                value = JSON.parse(value);
              } catch {
                throw Object.assign(new Error(`Invalid JSON value for ${key}`), {
                  type: 'parse',
                });
              }
            }
            break;
        }

        // Custom validation
        if (schemaItem.validate && !schemaItem.validate(value)) {
          throw Object.assign(new Error(`Validation failed for ${key}`), {
            type: 'validation',
          });
        }

        // Custom transform
        if (schemaItem.transform) {
          value = schemaItem.transform(value);
        }
      }

      return { value };
    } catch (error) {
      const configError = error as ConfigError;
      configError.key = key;
      configError.value = value;
      return { value, error: configError };
    }
  }, [schema]);

  // Initialize config from all sources
  const initializeConfig = useCallback(() => {
    const newConfig: Record<string, ConfigValue> = {};
    const newErrors: Record<string, ConfigError> = {};

    // Process each schema item
    Object.entries(schema).forEach(([key, schemaItem]) => {
      let value: any;
      let source: ConfigValue['source'] = 'default';

      // Check overrides first
      if (key in overrides) {
        value = overrides[key];
        source = 'override';
      }
      // Then check environment variables
      else if (typeof process !== 'undefined' && process.env) {
        const envKey = `${envPrefix}${key.toUpperCase()}`;
        if (envKey in process.env) {
          value = process.env[envKey];
          source = 'env';
        }
      }
      // Finally use default value
      else if ('default' in schemaItem) {
        value = schemaItem.default;
      }

      // Validate and transform value
      const { value: validatedValue, error } = validateValue(key, value, schemaItem);

      if (error) {
        newErrors[key] = error;
        onError?.(error);
      }

      newConfig[key] = {
        value: schemaItem.sensitive ? '[REDACTED]' : validatedValue,
        source,
        timestamp: Date.now(),
      };
    });

    setConfig(newConfig);
    setErrors(newErrors);
  }, [schema, overrides, envPrefix, validateValue, onError]);

  // Initialize on mount and when dependencies change
  useEffect(() => {
    initializeConfig();
  }, [initializeConfig]);

  // Get a config value
  const get = useCallback(<T = any>(key: string): T => {
    return config[key]?.value;
  }, [config]);

  // Set a config override
  const set = useCallback((key: string, value: any) => {
    if (!(key in schema)) {
      throw new Error(`Unknown config key: ${key}`);
    }

    const { value: validatedValue, error } = validateValue(key, value);

    if (error) {
      setErrors(prev => ({ ...prev, [key]: error }));
      onError?.(error);
      return;
    }

    setOverrides(prev => ({ ...prev, [key]: validatedValue }));
    setConfig(prev => ({
      ...prev,
      [key]: {
        value: schema[key].sensitive ? '[REDACTED]' : validatedValue,
        source: 'override',
        timestamp: Date.now(),
      },
    }));

    onChange?.(key, validatedValue, 'override');
  }, [schema, validateValue, setOverrides, onError, onChange]);

  // Remove a config override
  const unset = useCallback((key: string) => {
    setOverrides(prev => {
      const newOverrides = { ...prev };
      delete newOverrides[key];
      return newOverrides;
    });
    initializeConfig();
  }, [setOverrides, initializeConfig]);

  // Get all config values
  const getAll = useCallback(() => {
    return Object.entries(config).reduce((acc, [key, { value }]) => ({
      ...acc,
      [key]: value,
    }), {});
  }, [config]);

  // Get config metadata
  const getMeta = useCallback((key: string) => {
    const { value, ...meta } = config[key] || {};
    return meta;
  }, [config]);

  // Reset all overrides
  const reset = useCallback(() => {
    setOverrides({});
    initializeConfig();
  }, [setOverrides, initializeConfig]);

  return {
    config: getAll(),
    get,
    set,
    unset,
    reset,
    getMeta,
    errors,
  };
}

// Helper hook for feature flags
export function useFeatureFlags(flagSchema: Record<string, boolean>) {
  const schema = Object.entries(flagSchema).reduce((acc, [key, defaultValue]) => ({
    ...acc,
    [key]: {
      type: 'boolean',
      default: defaultValue,
    },
  }), {});

  const { config, set, unset } = useConfig({
    schema,
    envPrefix: 'FEATURE_',
    storageKey: 'feature-flags',
  });

  return {
    flags: config as Record<string, boolean>,
    setFlag: set,
    unsetFlag: unset,
  };
}
