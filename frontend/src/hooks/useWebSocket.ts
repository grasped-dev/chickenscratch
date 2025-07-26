import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface UseWebSocketOptions {
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data?: any) => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback?: (...args: any[]) => void) => void;
}

export const useWebSocket = (options: UseWebSocketOptions = {}): UseWebSocketReturn => {
  const {
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectDelay = 1000
  } = options;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // Get auth token from localStorage
  const getAuthToken = useCallback(() => {
    return localStorage.getItem('authToken');
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (socket?.connected) {
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setError('No authentication token available');
      return;
    }

    setIsConnecting(true);
    setError(null);

    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001', {
      auth: {
        token
      },
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true
    });

    // Connection successful
    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
      reconnectCountRef.current = 0;
    });

    // Connection error
    newSocket.on('connect_error', (err) => {
      console.error('WebSocket connection error:', err);
      setIsConnecting(false);
      setError(err.message || 'Connection failed');
      
      // Attempt reconnection
      if (reconnectCountRef.current < reconnectAttempts) {
        reconnectCountRef.current++;
        const delay = reconnectDelay * Math.pow(2, reconnectCountRef.current - 1); // Exponential backoff
        
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectCountRef.current}/${reconnectAttempts})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!socket?.connected) {
            connect();
          }
        }, delay);
      } else {
        setError('Failed to connect after multiple attempts');
      }
    });

    // Disconnection
    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setIsConnected(false);
      setIsConnecting(false);
      
      // Attempt reconnection for unexpected disconnections
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, don't reconnect
        setError('Disconnected by server');
      } else if (reason !== 'io client disconnect') {
        // Unexpected disconnect, attempt reconnection
        if (reconnectCountRef.current < reconnectAttempts) {
          setIsConnecting(true);
          connect();
        }
      }
    });

    // Authentication error
    newSocket.on('error', (err) => {
      console.error('WebSocket error:', err);
      setError(err.message || 'WebSocket error');
      setIsConnecting(false);
    });

    setSocket(newSocket);
  }, [socket, getAuthToken, reconnectAttempts, reconnectDelay]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
    reconnectCountRef.current = 0;
  }, [socket]);

  // Emit event
  const emit = useCallback((event: string, data?: any) => {
    if (socket?.connected) {
      socket.emit(event, data);
    } else {
      console.warn('Cannot emit event: WebSocket not connected');
    }
  }, [socket]);

  // Add event listener
  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    if (socket) {
      socket.on(event, callback);
    }
  }, [socket]);

  // Remove event listener
  const off = useCallback((event: string, callback?: (...args: any[]) => void) => {
    if (socket) {
      if (callback) {
        socket.off(event, callback);
      } else {
        socket.off(event);
      }
    }
  }, [socket]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect]); // Only run on mount/unmount

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      disconnect();
    };
  }, [disconnect]);

  return {
    socket,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    emit,
    on,
    off
  };
};