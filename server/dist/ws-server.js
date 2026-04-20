"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsServer = void 0;
exports.parseMessage = parseMessage;
exports.buildMessage = buildMessage;
const ws_1 = require("ws");
function parseMessage(raw) {
    try {
        const obj = JSON.parse(raw);
        if (typeof obj.event !== "string")
            return null;
        return obj;
    }
    catch {
        return null;
    }
}
function buildMessage(event, data) {
    return JSON.stringify({ event, data });
}
class WsServer {
    constructor(port, handler) {
        this.client = null;
        this.connectionHandler = null;
        this.handler = handler;
        this.wss = new ws_1.WebSocketServer({ port });
        this.wss.on("connection", (socket) => {
            this.client = socket;
            console.log("[WS] Client connected");
            this.connectionHandler?.(socket);
            socket.on("message", (raw) => {
                const msg = parseMessage(raw.toString());
                if (msg)
                    this.handler(msg.event, msg.data, socket);
            });
            socket.on("close", () => {
                console.log("[WS] Client disconnected");
                if (this.client === socket)
                    this.client = null;
            });
        });
        this.wss.on("listening", () => {
            console.log(`[WS] Listening on port ${port}`);
        });
    }
    send(event, data) {
        if (this.client?.readyState === ws_1.WebSocket.OPEN) {
            this.client.send(buildMessage(event, data));
        }
    }
    onClientConnected(handler) {
        this.connectionHandler = handler;
    }
    close() {
        this.wss.close();
    }
}
exports.WsServer = WsServer;
//# sourceMappingURL=ws-server.js.map