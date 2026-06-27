import {
  __soundBridgeDecodeBinaryAudioEnvelope as decodeBinaryAudioEnvelope,
  __soundBridgeEncodeBinaryAudioEnvelope as encodeBinaryAudioEnvelope
} from "./client";

let socket: WebSocket | undefined;

self.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (!message || typeof message !== "object") {
    return;
  }
  if (message.type === "connect") {
    connect(String(message.url ?? ""));
    return;
  }
  if (message.type === "request") {
    sendRequest(message.envelope, message.binaryAudioChannels);
    return;
  }
  if (message.type === "close") {
    socket?.close();
  }
};

function connect(url: string): void {
  socket?.close();
  socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  socket.addEventListener("open", () => {
    post({ type: "connected" });
  });
  socket.addEventListener("error", () => {
    post({ type: "connect-error", message: `Unable to connect to ${url}` });
  });
  socket.addEventListener("close", () => {
    post({ type: "closed" });
  });
  socket.addEventListener("message", (event) => {
    try {
      const envelope = typeof event.data === "string" ? JSON.parse(event.data) : decodeBinaryAudioEnvelope(event.data);
      post({ type: "message", envelope });
    } catch {
      post({ type: "protocol-error", message: "SoundBridge worker transport received an invalid message." });
    }
  });
}

function sendRequest(envelope: unknown, binaryAudioChannels?: ArrayLike<number>[]): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    post({ type: "send-error", id: requestId(envelope), message: "SoundBridge worker transport is not connected." });
    return;
  }
  try {
    socket.send(binaryAudioChannels ? encodeBinaryAudioEnvelope(envelope, binaryAudioChannels) : JSON.stringify(envelope));
  } catch (error) {
    post({ type: "send-error", id: requestId(envelope), message: String(error instanceof Error ? error.message : error) });
  }
}

function requestId(envelope: unknown): string | undefined {
  return envelope && typeof envelope === "object" ? String((envelope as { id?: unknown }).id ?? "") : undefined;
}

function post(message: unknown): void {
  self.postMessage(message);
}
