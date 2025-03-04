'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useEventListener } from './useEventListener';

interface UsePortalOptions {
  id?: string;
  mountPoint?: HTMLElement;
  onMount?: () => void;
  onUnmount?: () => void;
}

interface UseModalOptions {
  closeOnEsc?: boolean;
  closeOnOutsideClick?: boolean;
  preventScroll?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

export function usePortal({
  id = 'portal-root',
  mountPoint,
  onMount,
  onUnmount,
}: UsePortalOptions = {}) {
  const [container] = useState(() => {
    if (typeof window === 'undefined') return null;
    const existingContainer = document.getElementById(id);
    if (existingContainer) return existingContainer;

    const newContainer = document.createElement('div');
    newContainer.id = id;
    return newContainer;
  });

  useEffect(() => {
    if (!container) return;

    const target = mountPoint || document.body;
    target.appendChild(container);
    onMount?.();

    return () => {
      target.removeChild(container);
      onUnmount?.();
    };
  }, [container, mountPoint, onMount, onUnmount]);

  return container;
}

export function useModal({
  closeOnEsc = true,
  closeOnOutsideClick = true,
  preventScroll = true,
  onOpen,
  onClose,
}: UseModalOptions = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const open = useCallback(() => {
    setIsOpen(true);
    onOpen?.();

    if (preventScroll) {
      document.body.style.overflow = 'hidden';
    }

    // Store current active element
    previousActiveElement.current = document.activeElement as HTMLElement;
  }, [onOpen, preventScroll]);

  const close = useCallback(() => {
    setIsOpen(false);
    onClose?.();

    if (preventScroll) {
      document.body.style.overflow = '';
    }

    // Restore focus
    if (previousActiveElement.current) {
      previousActiveElement.current.focus();
    }
  }, [onClose, preventScroll]);

  const toggle = useCallback(() => {
    isOpen ? close() : open();
  }, [isOpen, close, open]);

  // Handle ESC key
  useEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (closeOnEsc && event.key === 'Escape' && isOpen) {
        close();
      }
    },
    document,
    { passive: true }
  );

  // Handle outside clicks
  useEventListener(
    'mousedown',
    (event: MouseEvent) => {
      if (
        closeOnOutsideClick &&
        isOpen &&
        contentRef.current &&
        !contentRef.current.contains(event.target as Node)
      ) {
        close();
      }
    },
    document,
    { passive: true }
  );

  return {
    isOpen,
    open,
    close,
    toggle,
    contentRef,
  };
}

// Helper hook for managing multiple modals
interface ModalState {
  [key: string]: boolean;
}

export function useModals(modalIds: string[]) {
  const [modals, setModals] = useState<ModalState>(() =>
    modalIds.reduce((acc, id) => ({ ...acc, [id]: false }), {})
  );

  const openModal = useCallback((id: string) => {
    setModals(prev => ({ ...prev, [id]: true }));
  }, []);

  const closeModal = useCallback((id: string) => {
    setModals(prev => ({ ...prev, [id]: false }));
  }, []);

  const toggleModal = useCallback((id: string) => {
    setModals(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const closeAll = useCallback(() => {
    setModals(prev =>
      Object.keys(prev).reduce((acc, key) => ({ ...acc, [key]: false }), {})
    );
  }, []);

  return {
    modals,
    openModal,
    closeModal,
    toggleModal,
    closeAll,
  };
}

// Helper hook for managing modal stack
interface ModalStackItem {
  id: string;
  component: React.ReactNode;
  options?: UseModalOptions;
}

export function useModalStack() {
  const [stack, setStack] = useState<ModalStackItem[]>([]);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const push = useCallback((modal: ModalStackItem) => {
    setStack(prev => [...prev, modal]);
    setActiveModal(modal.id);
  }, []);

  const pop = useCallback(() => {
    setStack(prev => {
      const newStack = prev.slice(0, -1);
      setActiveModal(newStack.length > 0 ? newStack[newStack.length - 1].id : null);
      return newStack;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setStack(prev => {
      const index = prev.findIndex(modal => modal.id === id);
      if (index === -1) return prev;

      const newStack = [...prev.slice(0, index), ...prev.slice(index + 1)];
      setActiveModal(
        newStack.length > 0 ? newStack[newStack.length - 1].id : null
      );
      return newStack;
    });
  }, []);

  const clear = useCallback(() => {
    setStack([]);
    setActiveModal(null);
  }, []);

  return {
    stack,
    activeModal,
    push,
    pop,
    remove,
    clear,
  };
}

// Helper hook for managing drawer/sidebar
export function useDrawer(options: UseModalOptions = {}) {
  const {
    isOpen,
    open,
    close,
    toggle,
    contentRef,
  } = useModal({
    ...options,
    closeOnOutsideClick: true,
  });

  const [position, setPosition] = useState<'left' | 'right'>('right');
  const [width, setWidth] = useState<string>('300px');

  const drawerStyle = {
    position: 'fixed',
    top: 0,
    [position]: 0,
    width,
    height: '100vh',
    transform: isOpen ? 'translateX(0)' : `translateX(${position === 'left' ? '-100%' : '100%'})`,
    transition: 'transform 0.3s ease-in-out',
  } as const;

  return {
    isOpen,
    open,
    close,
    toggle,
    contentRef,
    position,
    setPosition,
    width,
    setWidth,
    drawerStyle,
  };
}
