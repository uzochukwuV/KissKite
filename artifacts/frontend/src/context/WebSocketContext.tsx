import { createContext, useContext, ReactNode } from 'react';
import { useWebSocket, WebSocketMessage } from '../hooks/useWebSocket';

interface WebSocketContextType {
  messages: WebSocketMessage[];
  status: 'connecting' | 'connected' | 'disconnected';
  send: (data: any) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const ws = useWebSocket();
  return (
    <WebSocketContext.Provider value={ws}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}
