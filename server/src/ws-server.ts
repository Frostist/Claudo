import { WebSocketServer, WebSocket } from "ws";
import { WsEnvelope } from "./types";

export function parseMessage(raw: string): WsEnvelope | null {
  try {
    const obj = JSON.parse(raw);
    if (typeof obj.event !== "string") return null;
    return obj as WsEnvelope;
  } catch {
    return null;
  }
}

export function buildMessage(event: string, data: Record<string, unknown>): string {
  return JSON.stringify({ event, data });
}

export type MessageHandler = (event: string, data: Record<string, unknown>, socket: WebSocket) => void;

export class WsServer {
  private wss: WebSocketServer;
  private handler: MessageHandler;
  private client: WebSocket | null = null;
  private connectionHandler: ((socket: WebSocket) => void) | null = null;

  constructor(port: number, handler: MessageHandler) {
    this.handler = handler;
    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (socket) => {
      this.client = socket;
      console.log("[WS] Client connected");
      this.connectionHandler?.(socket);

      socket.on("message", (raw) => {
        const msg = parseMessage(raw.toString());
        if (msg) this.handler(msg.event, msg.data, socket);
      });

      socket.on("close", () => {
        console.log("[WS] Client disconnected");
        if (this.client === socket) this.client = null;
      });
    });

    this.wss.on("listening", () => {
      console.log(`[WS] Listening on port ${port}`);
    });
  }

  send(event: string, data: Record<string, unknown>): void {
    if (this.client?.readyState === WebSocket.OPEN) {
      this.client.send(buildMessage(event, data));
    }
  }

  onClientConnected(handler: (socket: WebSocket) => void): void {
    this.connectionHandler = handler;
  }

  close(): void {
    this.wss.close();
  }
}
