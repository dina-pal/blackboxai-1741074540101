'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseFocusOptions {
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  selectOnFocus?: boolean;
}

interface UseFocusReturn {
  ref: React.RefObject<HTMLElement>;
  isFocused: boolean;
  focus: () => void;
  blur: () => void;
}

interface UseFocusTrapOptions {
  isActive?: boolean;
  initialFocus?: boolean;
  returnFocus?: boolean;
  escapeDeactivates?: boolean;
  clickOutsideDeactivates?: boolean;
  onActivate?: () => void;
  onDeactivate?: () => void;
}

const FOCUSABLE_ELEMENTS = [
  'a[href]',
  'area[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocus<T extends HTMLElement = HTMLElement>({
  autoFocus = false,
  onFocus,
  onBlur,
  selectOnFocus = false,
}: UseFocusOptions = {}): UseFocusReturn {
  const ref = useRef<T>(null);
  const [isFocused, setIsFocused] = useState(false);

  const focus = useCallback(() => {
    if (ref.current) {
      ref.current.focus();
      if (selectOnFocus && 'select' in ref.current) {
        (ref.current as unknown as { select: () => void }).select();
      }
    }
  }, [selectOnFocus]);

  const blur = useCallback(() => {
    ref.current?.blur();
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleFocus = () => {
      setIsFocused(true);
      onFocus?.();
    };

    const handleBlur = () => {
      setIsFocused(false);
      onBlur?.();
    };

    element.addEventListener('focus', handleFocus);
    element.addEventListener('blur', handleBlur);

    if (autoFocus) {
      focus();
    }

    return () => {
      element.removeEventListener('focus', handleFocus);
      element.removeEventListener('blur', handleBlur);
    };
  }, [autoFocus, focus, onFocus, onBlur]);

  return { ref, isFocused, focus, blur };
}

export function useFocusTrap<T extends HTMLElement = HTMLElement>({
  isActive = true,
  initialFocus = true,
  returnFocus = true,
  escapeDeactivates = true,
  clickOutsideDeactivates = false,
  onActivate,
  onDeactivate,
}: UseFocusTrapOptions = {}) {
  const containerRef = useRef<T>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const firstFocusableElement = useRef<HTMLElement | null>(null);
  const lastFocusableElement = useRef<HTMLElement | null>(null);

  // Get all focusable elements within the container
  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS)
    ).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
  }, []);

  // Update focusable elements
  const updateFocusableElements = useCallback(() => {
    const elements = getFocusableElements();
    firstFocusableElement.current = elements[0] || null;
    lastFocusableElement.current = elements[elements.length - 1] || null;
  }, [getFocusableElements]);

  // Handle tab key
  const handleTab = useCallback((e: KeyboardEvent) => {
    if (!isActive || !containerRef.current) return;

    updateFocusableElements();

    if (!firstFocusableElement.current || !lastFocusableElement.current) {
      e.preventDefault();
      return;
    }

    const isTabbing = e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey;
    if (!isTabbing) return;

    const activeElement = document.activeElement;

    if (e.shiftKey) {
      // Shift + Tab
      if (activeElement === firstFocusableElement.current) {
        e.preventDefault();
        lastFocusableElement.current.focus();
      }
    } else {
      // Tab
      if (activeElement === lastFocusableElement.current) {
        e.preventDefault();
        firstFocusableElement.current.focus();
      }
    }
  }, [isActive, updateFocusableElements]);

  // Handle escape key
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (isActive && escapeDeactivates && e.key === 'Escape') {
      onDeactivate?.();
    }
  }, [isActive, escapeDeactivates, onDeactivate]);

  // Handle click outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      isActive &&
      clickOutsideDeactivates &&
      containerRef.current &&
      !containerRef.current.contains(e.target as Node)
    ) {
      onDeactivate?.();
    }
  }, [isActive, clickOutsideDeactivates, onDeactivate]);

  // Set up focus trap
  useEffect(() => {
    if (!isActive) return;

    // Store current active element
    previousActiveElement.current = document.activeElement;

    // Initial focus
    if (initialFocus) {
      updateFocusableElements();
      firstFocusableElement.current?.focus();
    }

    onActivate?.();

    // Event listeners
    document.addEventListener('keydown', handleTab);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleTab);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);

      // Return focus
      if (returnFocus && previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }

      onDeactivate?.();
    };
  }, [
    isActive,
    initialFocus,
    returnFocus,
    handleTab,
    handleEscape,
    handleClickOutside,
    updateFocusableElements,
    onActivate,
    onDeactivate,
  ]);

  return containerRef;
}

// Helper hook for managing focus within a list
export function useFocusList<T extends HTMLElement = HTMLElement>(
  items: any[],
  options: UseFocusOptions = {}
) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const itemRefs = useRef<Array<T | null>>([]);

  // Update refs array when items change
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, items.length);
  }, [items]);

  const focusItem = useCallback((index: number) => {
    if (index >= 0 && index < items.length) {
      itemRefs.current[index]?.focus();
      setFocusedIndex(index);
    }
  }, [items.length]);

  const getItemProps = useCallback((index: number) => ({
    ref: (el: T | null) => {
      itemRefs.current[index] = el;
    },
    tabIndex: index === focusedIndex ? 0 : -1,
    onFocus: () => setFocusedIndex(index),
  }), [focusedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusItem((focusedIndex + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(focusedIndex <= 0 ? items.length - 1 : focusedIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(items.length - 1);
        break;
    }
  }, [focusedIndex, items.length, focusItem]);

  return {
    focusedIndex,
    setFocusedIndex,
    focusItem,
    getItemProps,
    handleKeyDown,
  };
}
