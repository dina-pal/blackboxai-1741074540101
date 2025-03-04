'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNetwork } from './useNetwork';

interface WebSocketOptions {
  url: string;
  protocols?: string | string[];
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  heartbeatMessage?: string | object;
  onOpen?: (event: WebSocketEventMap['open']) => void;
  onClose?: (event: WebSocketEventMap['close']) => void;
  onMessage?: (event: WebSocketEventMap['message']) => void;
  onError?: (event: WebSocketEventMap['error']) => void;
  onReconnect?: () => void;
}

interface WebSocketState {
  readyState: number;
  connected: boolean;
  error: Error | null;
  lastMessage: any;
  reconnectCount: number;
}

export function useWebSocket({
  url,
  protocols,
  reconnectAttempts = 5,
  reconnectInterval = 3000,
  heartbeatInterval = 30000,
  heartbeatMessage = 'ping',
  onOpen,
  onClose,
  onMessage,
  onError,
  onReconnect,
}: WebSocketOptions) {
  const [state, setState] = useState<WebSocketState>({
    readyState: WebSocket.CLOSED,
    connected: false,
    error: null,
    lastMessage: null,
    reconnectCount: 0,
  });

  const { online } = useNetwork();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>();
  const reconnectingRef = useRef(false);
  const messageQueueRef = useRef<any[]>([]);

  // Create WebSocket connection
  const connect = useCallback(() => {
    if (!online || wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      wsRef.current = new WebSocket(url, protocols);
      setState(prev => ({ ...prev, readyState: WebSocket.CONNECTING }));

      wsRef.current.onopen = (event) => {
        setState(prev => ({
          ...prev,
          connected: true,
          error: null,
          readyState: WebSocket.OPEN,
          reconnectCount: 0,
        }));

        // Send queued messages
        while (messageQueueRef.current.length > 0) {
          const message = messageQueueRef.current.shift();
          send(message);
        }

        // Start heartbeat
        if (heartbeatInterval > 0) {
          heartbeatIntervalRef.current = setInterval(() => {
            send(heartbeatMessage);
          }, heartbeatInterval);
        }

        onOpen?.(event);
      };

      wsRef.current.onclose = (event) => {
        setState(prev => ({
          ...prev,
          connected: false,
          readyState: WebSocket.CLOSED,
        }));

        clearInterval(heartbeatIntervalRef.current);

        if (!reconnectingRef.current && state.reconnectCount < reconnectAttempts) {
          reconnectingRef.current = true;
          reconnectTimeoutRef.current = setTimeout(() => {
            setState(prev => ({
              ...prev,
              reconnectCount: prev.reconnectCount + 1,
            }));
            reconnectingRef.current = false;
            onReconnect?.();
            connect();
          }, reconnectInterval);
        }

        onClose?.(event);
      };

      wsRef.current.onerror = (event) => {
        setState(prev => ({
          ...prev,
          error: new Error('WebSocket error'),
          readyState: wsRef.current?.readyState || WebSocket.CLOSED,
        }));
        onError?.(event);
      };

      wsRef.current.onmessage = (event) => {
        let parsedData;
        try {
          parsedData = JSON.parse(event.data);
        } catch {
          parsedData = event.data;
        }

        setState(prev => ({
          ...prev,
          lastMessage: parsedData,
        }));

        onMessage?.(event);
      };
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to connect'),
        readyState: WebSocket.CLOSED,
      }));
    }
  }, [
    url,
    protocols,
    online,
    heartbeatInterval,
    heartbeatMessage,
    reconnectAttempts,
    reconnectInterval,
    state.reconnectCount,
    onOpen,
    onClose,
    onMessage,
    onError,
    onReconnect,
  ]);

  // Send message
  const send = useCallback((message: any) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      messageQueueRef.current.push(message);
      return false;
    }

    try {
      const data = typeof message === 'string' ? message : JSON.stringify(message);
      wsRef.current.send(data);
      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to send message'),
      }));
      return false;
    }
  }, []);

  // Close connection
  const close = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    messageQueueRef.current = [];
    setState(prev => ({
      ...prev,
      connected: false,
      readyState: WebSocket.CLOSED,
    }));
  }, []);

  // Connect when online
  useEffect(() => {
    if (online) {
      connect();
    }
    return close;
  }, [online, connect, close]);

  // Reconnect on network status change
  useEffect(() => {
    if (online && !state.connected && state.reconnectCount < reconnectAttempts) {
      connect();
    }
  }, [online, state.connected, state.reconnectCount, reconnectAttempts, connect]);

  return {
    ...state,
    send,
    close,
    connect,
  };
}

// Helper hook for WebSocket subscriptions
interface Subscription {
  event: string;
  handler: (data: any) => void;
}

export function useWebSocketSubscription(
  url: string,
  subscriptions: Subscription[],
  options?: Omit<WebSocketOptions, 'url' | 'onMessage'>
) {
  const ws = useWebSocket({
    ...options,
    url,
    onMessage: (event) => {
      try {
        const { event: eventName, data } = JSON.parse(event.data);
        const subscription = subscriptions.find(sub => sub.event === eventName);
        if (subscription) {
          subscription.handler(data);
        }
      } catch (error) {
        console.error('Failed to handle WebSocket message:', error);
      }
    },
  });

  useEffect(() => {
    if (ws.connected) {
      subscriptions.forEach(({ event }) => {
        ws.send({ type: 'subscribe', event });
      });
    }
    return () => {
      if (ws.connected) {
        subscriptions.forEach(({ event }) => {
          ws.send({ type: 'unsubscribe', event });
        });
      }
    };
  }, [ws.connected, subscriptions]);

  return ws;
}

// Helper hook for WebSocket rooms
export function useWebSocketRoom(
  url: string,
  roomId: string,
  options?: Omit<WebSocketOptions, 'url'>
) {
  const ws = useWebSocket({
    ...options,
    url,
    onOpen: (event) => {
      ws.send({ type: 'join', roomId });
      options?.onOpen?.(event);
    },
    onClose: (event) => {
      ws.send({ type: 'leave', roomId });
      options?.onClose?.(event);
    },
  });

  const sendToRoom = useCallback((message: any) => {
    ws.send({
      type: 'room_message',
      roomId,
      message,
    });
  }, [ws, roomId]);

  return {
    ...ws,
    sendToRoom,
  };
}
