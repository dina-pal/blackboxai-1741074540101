'use client';

import { useState, useCallback } from 'react';
import { useNotification } from './useNotification';

interface UseClipboardOptions {
  timeout?: number;
  successMessage?: string;
  errorMessage?: string;
  showNotification?: boolean;
}

interface UseClipboardReturn {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
  copyFromElement: (element: HTMLElement) => Promise<boolean>;
  copyFromRef: (ref: React.RefObject<HTMLElement>) => Promise<boolean>;
  clear: () => void;
}

export function useClipboard({
  timeout = 2000,
  successMessage = 'Copied to clipboard',
  errorMessage = 'Failed to copy to clipboard',
  showNotification = true,
}: UseClipboardOptions = {}): UseClipboardReturn {
  const [copied, setCopied] = useState(false);
  const { success, error: showError } = useNotification();

  const clear = useCallback(() => {
    setCopied(false);
  }, []);

  const handleSuccess = useCallback(() => {
    setCopied(true);
    if (showNotification) {
      success('Success', successMessage);
    }
    if (timeout) {
      setTimeout(clear, timeout);
    }
  }, [success, successMessage, timeout, clear, showNotification]);

  const handleError = useCallback((err: Error) => {
    setCopied(false);
    if (showNotification) {
      showError('Error', err.message || errorMessage);
    }
  }, [showError, errorMessage, showNotification]);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        // Use modern Clipboard API when available
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        
        // Avoid scrolling to bottom
        textArea.style.cssText = `
          position: fixed;
          top: -99999px;
          left: -99999px;
          width: 2em;
          height: 2em;
          padding: 0;
          border: none;
          outline: none;
          box-shadow: none;
          background: transparent;
        `;

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          document.execCommand('copy');
        } catch (err) {
          throw new Error('Copy command failed');
        } finally {
          document.body.removeChild(textArea);
        }
      }

      handleSuccess();
      return true;
    } catch (err) {
      handleError(err instanceof Error ? err : new Error('Copy failed'));
      return false;
    }
  }, [handleSuccess, handleError]);

  const copyFromElement = useCallback(async (element: HTMLElement): Promise<boolean> => {
    try {
      let text: string;

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        text = element.value;
      } else {
        text = element.textContent || '';
      }

      return await copy(text);
    } catch (err) {
      handleError(err instanceof Error ? err : new Error('Copy from element failed'));
      return false;
    }
  }, [copy, handleError]);

  const copyFromRef = useCallback(async (ref: React.RefObject<HTMLElement>): Promise<boolean> => {
    if (!ref.current) {
      handleError(new Error('Element reference is not available'));
      return false;
    }

    return copyFromElement(ref.current);
  }, [copyFromElement, handleError]);

  return {
    copied,
    copy,
    copyFromElement,
    copyFromRef,
    clear,
  };
}

// Helper hook for copying formatted text
interface UseFormattedClipboardOptions extends UseClipboardOptions {
  formatText?: (text: string) => string;
}

export function useFormattedClipboard({
  formatText = (text: string) => text,
  ...options
}: UseFormattedClipboardOptions = {}) {
  const clipboard = useClipboard(options);

  const copyFormatted = useCallback(async (text: string): Promise<boolean> => {
    const formatted = formatText(text);
    return clipboard.copy(formatted);
  }, [clipboard, formatText]);

  return {
    ...clipboard,
    copyFormatted,
  };
}

// Helper hook for copying multiple items
interface UseMultiClipboardOptions extends UseClipboardOptions {
  separator?: string;
}

export function useMultiClipboard({
  separator = '\n',
  ...options
}: UseMultiClipboardOptions = {}) {
  const clipboard = useClipboard(options);

  const copyMultiple = useCallback(async (items: string[]): Promise<boolean> => {
    const text = items.join(separator);
    return clipboard.copy(text);
  }, [clipboard, separator]);

  const copyFromElements = useCallback(async (elements: HTMLElement[]): Promise<boolean> => {
    const texts = elements.map(element => 
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.value
        : element.textContent || ''
    );

    return copyMultiple(texts);
  }, [copyMultiple]);

  return {
    ...clipboard,
    copyMultiple,
    copyFromElements,
  };
}

// Helper hook for copying with history
interface UseClipboardHistoryOptions extends UseClipboardOptions {
  maxHistory?: number;
}

export function useClipboardHistory({
  maxHistory = 10,
  ...options
}: UseClipboardHistoryOptions = {}) {
  const [history, setHistory] = useState<string[]>([]);
  const clipboard = useClipboard({
    ...options,
    timeout: 0, // Disable auto-clear for history
  });

  const copyWithHistory = useCallback(async (text: string): Promise<boolean> => {
    const success = await clipboard.copy(text);
    if (success) {
      setHistory(prev => {
        const newHistory = [text, ...prev.filter(item => item !== text)];
        return newHistory.slice(0, maxHistory);
      });
    }
    return success;
  }, [clipboard, maxHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    clipboard.clear();
  }, [clipboard]);

  return {
    ...clipboard,
    copyWithHistory,
    history,
    clearHistory,
  };
}
