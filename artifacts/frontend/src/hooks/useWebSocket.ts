import { useState, useEffect, useCallback } from 'react';
import type { Signal } from '@workspace/api-client-react';

export type WebSocketMessage = 
  | { type: 'signal'; data: Signal }
  | { type: 'reputation_update'; data: { agentId: number; score: number } }
  | { type: 'connected'; data: any };

export function useWebSocket() {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let backoff = 1000;
    
    function connect() {
      setStatus('connecting');
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = localStorage.getItem('kite_session_token');
      const wsUrl = `${wsProto}//${window.location.host}/ws${token ? `?token=${token}` : ''}`;
      
      const socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        setStatus('connected');
        backoff = 1000;
      };
      
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WebSocketMessage;
          setMessages(prev => [...prev.slice(-100), msg]);
        } catch (e) {
          console.error("Failed to parse websocket message", e);
        }
      };
      
      socket.onclose = () => {
        setStatus('disconnected');
        reconnectTimeout = setTimeout(() => {
          backoff = Math.min(backoff * 1.5, 30000);
          connect();
        }, backoff);
      };

      setWs(socket);
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  const send = useCallback((data: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, [ws]);

  return { messages, status, send };
}
