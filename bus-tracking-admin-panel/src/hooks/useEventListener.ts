'use client';

import { RefObject, useEffect, useRef } from 'react';

type EventMap = WindowEventMap & DocumentEventMap & HTMLElementEventMap;

type EventType<T extends EventTarget> = T extends Window
  ? keyof WindowEventMap
  : T extends Document
  ? keyof DocumentEventMap
  : T extends HTMLElement
  ? keyof HTMLElementEventMap
  : string;

type Handler<T extends Event> = (event: T) => void;

interface UseEventListenerOptions {
  capture?: boolean;
  passive?: boolean;
  once?: boolean;
}

export function useEventListener<
  T extends EventTarget = EventTarget,
  K extends EventType<T> = EventType<T>
>(
  eventName: K,
  handler: Handler<Event>,
  element?: RefObject<T> | T | null,
  options: UseEventListenerOptions = {}
): void {
  // Create a ref that stores handler
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    // Define the listening target
    const targetElement: T | undefined = element
      ? 'current' in element
        ? element.current
        : element
      : window as unknown as T;

    if (!targetElement?.addEventListener) return;

    // Create event listener that calls handler function stored in ref
    const eventListener: typeof handler = event => savedHandler.current(event);

    targetElement.addEventListener(eventName as string, eventListener, {
      capture: options.capture,
      passive: options.passive,
      once: options.once,
    });

    // Remove event listener on cleanup
    return () => {
      targetElement.removeEventListener(eventName as string, eventListener, {
        capture: options.capture,
      });
    };
  }, [eventName, element, options.capture, options.passive, options.once]);
}

// Helper hook for window events
export function useWindowEvent<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: UseEventListenerOptions
): void {
  useEventListener(eventName, handler as Handler<Event>, window, options);
}

// Helper hook for document events
export function useDocumentEvent<K extends keyof DocumentEventMap>(
  eventName: K,
  handler: (event: DocumentEventMap[K]) => void,
  options?: UseEventListenerOptions
): void {
  useEventListener(eventName, handler as Handler<Event>, document, options);
}

// Helper hook for element events
export function useElementEvent<K extends keyof HTMLElementEventMap>(
  element: RefObject<HTMLElement> | HTMLElement | null,
  eventName: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: UseEventListenerOptions
): void {
  useEventListener(eventName, handler as Handler<Event>, element, options);
}

// Helper hook for mouse events
export function useMouseEvents(
  element?: RefObject<HTMLElement> | HTMLElement | null,
  options?: UseEventListenerOptions
) {
  const mouseEvents = {
    onMouseEnter: useRef<((event: MouseEvent) => void) | null>(null),
    onMouseLeave: useRef<((event: MouseEvent) => void) | null>(null),
    onMouseMove: useRef<((event: MouseEvent) => void) | null>(null),
    onMouseDown: useRef<((event: MouseEvent) => void) | null>(null),
    onMouseUp: useRef<((event: MouseEvent) => void) | null>(null),
    onClick: useRef<((event: MouseEvent) => void) | null>(null),
  };

  useElementEvent(
    element,
    'mouseenter',
    event => mouseEvents.onMouseEnter.current?.(event),
    options
  );
  useElementEvent(
    element,
    'mouseleave',
    event => mouseEvents.onMouseLeave.current?.(event),
    options
  );
  useElementEvent(
    element,
    'mousemove',
    event => mouseEvents.onMouseMove.current?.(event),
    options
  );
  useElementEvent(
    element,
    'mousedown',
    event => mouseEvents.onMouseDown.current?.(event),
    options
  );
  useElementEvent(
    element,
    'mouseup',
    event => mouseEvents.onMouseUp.current?.(event),
    options
  );
  useElementEvent(
    element,
    'click',
    event => mouseEvents.onClick.current?.(event),
    options
  );

  return mouseEvents;
}

// Helper hook for keyboard events
export function useKeyboardEvents(
  element?: RefObject<HTMLElement> | HTMLElement | null,
  options?: UseEventListenerOptions
) {
  const keyboardEvents = {
    onKeyDown: useRef<((event: KeyboardEvent) => void) | null>(null),
    onKeyUp: useRef<((event: KeyboardEvent) => void) | null>(null),
    onKeyPress: useRef<((event: KeyboardEvent) => void) | null>(null),
  };

  useElementEvent(
    element,
    'keydown',
    event => keyboardEvents.onKeyDown.current?.(event),
    options
  );
  useElementEvent(
    element,
    'keyup',
    event => keyboardEvents.onKeyUp.current?.(event),
    options
  );
  useElementEvent(
    element,
    'keypress',
    event => keyboardEvents.onKeyPress.current?.(event),
    options
  );

  return keyboardEvents;
}

// Helper hook for touch events
export function useTouchEvents(
  element?: RefObject<HTMLElement> | HTMLElement | null,
  options?: UseEventListenerOptions
) {
  const touchEvents = {
    onTouchStart: useRef<((event: TouchEvent) => void) | null>(null),
    onTouchEnd: useRef<((event: TouchEvent) => void) | null>(null),
    onTouchMove: useRef<((event: TouchEvent) => void) | null>(null),
    onTouchCancel: useRef<((event: TouchEvent) => void) | null>(null),
  };

  useElementEvent(
    element,
    'touchstart',
    event => touchEvents.onTouchStart.current?.(event),
    options
  );
  useElementEvent(
    element,
    'touchend',
    event => touchEvents.onTouchEnd.current?.(event),
    options
  );
  useElementEvent(
    element,
    'touchmove',
    event => touchEvents.onTouchMove.current?.(event),
    options
  );
  useElementEvent(
    element,
    'touchcancel',
    event => touchEvents.onTouchCancel.current?.(event),
    options
  );

  return touchEvents;
}
