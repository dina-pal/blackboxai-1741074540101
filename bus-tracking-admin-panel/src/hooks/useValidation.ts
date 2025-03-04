'use client';

import { useState, useCallback, useMemo } from 'react';
import { isValidEmail } from '@/lib/utils';

export type ValidationRule<T> = {
  validate: (value: T, formValues?: any) => boolean;
  message: string;
};

export type ValidationSchema<T> = {
  [K in keyof T]?: ValidationRule<T[K]>[];
};

interface UseValidationOptions<T> {
  initialValues: T;
  schema: ValidationSchema<T>;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
}

interface ValidationState<T> {
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isValid: boolean;
}

interface UseValidationReturn<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isValid: boolean;
  isDirty: boolean;
  handleChange: (field: keyof T) => (value: T[keyof T]) => void;
  handleBlur: (field: keyof T) => () => void;
  validate: () => boolean;
  validateField: (field: keyof T) => boolean;
  setFieldValue: (field: keyof T, value: T[keyof T]) => void;
  setFieldTouched: (field: keyof T, isTouched?: boolean) => void;
  reset: () => void;
}

// Common validation rules
export const validationRules = {
  required: (message = 'This field is required'): ValidationRule<any> => ({
    validate: (value: any) => {
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'string') return value.trim().length > 0;
      return value !== null && value !== undefined;
    },
    message,
  }),

  email: (message = 'Invalid email address'): ValidationRule<string> => ({
    validate: isValidEmail,
    message,
  }),

  minLength: (length: number, message = `Must be at least ${length} characters`): ValidationRule<string> => ({
    validate: (value) => value.length >= length,
    message,
  }),

  maxLength: (length: number, message = `Must be no more than ${length} characters`): ValidationRule<string> => ({
    validate: (value) => value.length <= length,
    message,
  }),

  pattern: (pattern: RegExp, message = 'Invalid format'): ValidationRule<string> => ({
    validate: (value) => pattern.test(value),
    message,
  }),

  match: (fieldToMatch: string, message = 'Fields must match'): ValidationRule<any> => ({
    validate: (value, formValues) => value === formValues[fieldToMatch],
    message,
  }),

  min: (min: number, message = `Must be at least ${min}`): ValidationRule<number> => ({
    validate: (value) => value >= min,
    message,
  }),

  max: (max: number, message = `Must be no more than ${max}`): ValidationRule<number> => ({
    validate: (value) => value <= max,
    message,
  }),

  url: (message = 'Invalid URL'): ValidationRule<string> => ({
    validate: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    message,
  }),

  phone: (message = 'Invalid phone number'): ValidationRule<string> => ({
    validate: (value) => /^\+?[\d\s-()]+$/.test(value),
    message,
  }),
};

export function useValidation<T extends Record<string, any>>({
  initialValues,
  schema,
  validateOnChange = true,
  validateOnBlur = true,
}: UseValidationOptions<T>): UseValidationReturn<T> {
  const [values, setValues] = useState<T>(initialValues);
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  // Validate a single field
  const validateField = useCallback((field: keyof T): boolean => {
    const fieldRules = schema[field];
    if (!fieldRules) return true;

    for (const rule of fieldRules) {
      if (!rule.validate(values[field], values)) {
        setErrors(prev => ({ ...prev, [field]: rule.message }));
        return false;
      }
    }

    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
    return true;
  }, [values, schema]);

  // Validate all fields
  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    Object.keys(schema).forEach((field) => {
      const fieldRules = schema[field as keyof T];
      if (!fieldRules) return;

      for (const rule of fieldRules) {
        if (!rule.validate(values[field as keyof T], values)) {
          newErrors[field as keyof T] = rule.message;
          isValid = false;
          break;
        }
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [values, schema]);

  // Handle field change
  const handleChange = useCallback((field: keyof T) => (value: T[keyof T]) => {
    setValues(prev => ({ ...prev, [field]: value }));
    if (validateOnChange) {
      validateField(field);
    }
  }, [validateOnChange, validateField]);

  // Handle field blur
  const handleBlur = useCallback((field: keyof T) => () => {
    setTouched(prev => ({ ...prev, [field]: true }));
    if (validateOnBlur) {
      validateField(field);
    }
  }, [validateOnBlur, validateField]);

  // Set field value programmatically
  const setFieldValue = useCallback((field: keyof T, value: T[keyof T]) => {
    setValues(prev => ({ ...prev, [field]: value }));
    if (validateOnChange) {
      validateField(field);
    }
  }, [validateOnChange, validateField]);

  // Set field touched state programmatically
  const setFieldTouched = useCallback((field: keyof T, isTouched = true) => {
    setTouched(prev => ({ ...prev, [field]: isTouched }));
    if (validateOnBlur && isTouched) {
      validateField(field);
    }
  }, [validateOnBlur, validateField]);

  // Reset form to initial values
  const reset = useCallback(() => {
    setValues(initialValues);
    setTouched({});
    setErrors({});
  }, [initialValues]);

  // Computed properties
  const isValid = useMemo(() => Object.keys(errors).length === 0, [errors]);
  const isDirty = useMemo(() => 
    Object.keys(values).some(key => values[key] !== initialValues[key]),
    [values, initialValues]
  );

  return {
    values,
    errors,
    touched,
    isValid,
    isDirty,
    handleChange,
    handleBlur,
    validate,
    validateField,
    setFieldValue,
    setFieldTouched,
    reset,
  };
}
