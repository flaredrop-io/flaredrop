import { Env } from './types';

interface WebSocketSession {
  deviceId: string;
  webSocket: WebSocket;
}

export class RelayDurableObject {
  private sessions: Map<string, WebSocketSession> = new Map();
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      const deviceId = url.searchParams.get('deviceId');
      if (!deviceId) {
        return new Response('Missing deviceId', { status: 400 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.state.acceptWebSocket(server);

      const session: WebSocketSession = { deviceId, webSocket: server };
      this.sessions.set(deviceId, session);

      server.addEventListener('close', () => {
        this.sessions.delete(deviceId);
      });

      server.addEventListener('error', () => {
        this.sessions.delete(deviceId);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/notify' && request.method === 'POST') {
      const { targetDeviceId, message } = await request.json() as { targetDeviceId: string; message: unknown };

      const session = this.sessions.get(targetDeviceId);
      if (session) {
        try {
          session.webSocket.send(JSON.stringify(message));
          return new Response('OK');
        } catch {
          this.sessions.delete(targetDeviceId);
        }
      }

      return new Response('Device not connected', { status: 404 });
    }

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const { message, excludeDeviceId } = await request.json() as { message: unknown; excludeDeviceId?: string };

      for (const [deviceId, session] of this.sessions) {
        if (deviceId !== excludeDeviceId) {
          try {
            session.webSocket.send(JSON.stringify(message));
          } catch {
            this.sessions.delete(deviceId);
          }
        }
      }

      return new Response('OK');
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Handle incoming WebSocket messages if needed
    console.log('WebSocket message:', message);
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    for (const [deviceId, session] of this.sessions) {
      if (session.webSocket === ws) {
        this.sessions.delete(deviceId);
        break;
      }
    }
  }
}

export function getRelay(env: Env): DurableObjectStub {
  const id = env.RELAY.idFromName('global');
  return env.RELAY.get(id);
}
