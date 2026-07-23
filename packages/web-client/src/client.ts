import type {
  AudioBlockRequest,
  AudioBlockResponse,
  AutomationLanePoint,
  ClearAutomationLaneResponse,
  CreateFileGrantRequest,
  FileGrant,
  FileGrantOperation,
  CreateInstanceRequest,
  CreateInstanceResponse,
  CloseEditorResponse,
  GetVst3ProgramDataResponse,
  HelloResponse,
  MidiEvent,
  OpenEditorResponse,
  ParameterAutomationEvent,
  ParameterAutomationPoint,
  PluginMetadata,
  PluginParameter,
  PluginScanRequest,
  ProtocolCommand,
  RequestEnvelope,
  ResponseEnvelope,
  SetAutomationLaneResponse,
  SetVst3ProgramDataResponse
} from "../../protocol/src/messages";
import {
  decodeBinaryAudioEnvelope,
  encodeBinaryAudioEnvelope,
  type BinaryAudioBusBlock
} from "./binary-audio-codec";
import { createSharedAudioTransport, type SharedAudioTransportDescriptor, type SharedAudioTransportOptions } from "./shared-audio";

export type { SharedAudioTransportDescriptor } from "./shared-audio";
export type { BinaryAudioBusBlock } from "./binary-audio-codec";

export interface PlugRelayClientOptions {
  url?: string;
  origin?: string;
  pairingToken?: string;
  requestTimeoutMs?: number;
  transport?: "main" | "worker";
  transportWorkerUrl?: string | URL;
}

export interface BinaryAudioBlockRequest extends Omit<AudioBlockRequest, "channels" | "inputBuses"> {
  channels: ArrayLike<number>[];
  inputBuses?: BinaryAudioBusBlock[];
}
export interface AudioWorkletTransportOptions extends SharedAudioTransportOptions {
  instanceId: string;
  sampleRate: number;
  maxInFlightBlocks?: number;
  audioRequestTimeoutMs?: number;
  audioTransport?: "binary" | "json";
}

export interface AudioWorkletTransportConnection {
  port: MessagePort;
  sharedAudio?: SharedAudioTransportDescriptor;
}

export class PlugRelayProtocolError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "PlugRelayProtocolError";
    this.code = code;
    this.details = details;
  }
}

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timeout?: number;
}

interface WorkerTransportMessage {
  type?: string;
  envelope?: ResponseEnvelope | { type: "event"; event: string; payload: unknown };
  id?: string;
  message?: string;
}

export class PlugRelayClient extends EventTarget {
  readonly url: string;
  readonly origin: string;
  readonly requestTimeoutMs: number;
  readonly pairingToken?: string;
  readonly transport: "main" | "worker";
  readonly transportWorkerUrl: string | URL;

  private socket?: WebSocket;
  private worker?: Worker;
  private workerConnected = false;
  private requestSeq = 0;
  private sessionToken?: string;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly workerMessageHandler = (event: MessageEvent<WorkerTransportMessage>) => {
    this.handleWorkerMessage(event.data);
  };

  constructor(options: PlugRelayClientOptions = {}) {
    super();
    this.url = options.url ?? "ws://127.0.0.1:47370/bridge";
    this.origin = options.origin ?? globalThis.location?.origin ?? "unknown-origin";
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5000;
    this.pairingToken = options.pairingToken;
    this.transport = options.transport === "worker" ? "worker" : "main";
    this.transportWorkerUrl = options.transportWorkerUrl ?? new URL("./plugrelay-transport-worker.js", import.meta.url);
  }

  connect(): Promise<void> {
    if (this.transport === "worker") {
      return this.connectWorker();
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    const previousSocket = this.socket;
    if (previousSocket) {
      this.socket = undefined;
      this.rejectPendingRequests("PlugRelay socket closed before reconnect");
      previousSocket.close();
    }
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      socket.binaryType = "arraybuffer";
      this.socket = socket;

      socket.addEventListener("open", () => this.socket === socket && resolve(), { once: true });
      socket.addEventListener("error", () => this.socket === socket && reject(new Error(`Unable to connect to ${this.url}`)), { once: true });
      socket.addEventListener("message", (event) => this.socket === socket && this.handleMessage(event.data));
      socket.addEventListener("close", () => {
        if (this.socket !== socket) return;
        this.socket = undefined;
        this.rejectPendingRequests("PlugRelay socket closed before response");
        this.dispatchEvent(new CustomEvent("disconnect"));
      });
    });
  }

  private connectWorker(): Promise<void> {
    if (this.worker && this.workerConnected) {
      return Promise.resolve();
    }
    if (typeof Worker === "undefined") {
      return Promise.reject(new Error("PlugRelay worker transport is not available in this environment."));
    }

    return new Promise((resolve, reject) => {
      if (!this.worker) {
        this.worker = new Worker(this.transportWorkerUrl, { type: "module" });
        this.worker.addEventListener("message", this.workerMessageHandler);
      }
      const worker = this.worker;
      const cleanup = () => {
        worker.removeEventListener("message", onConnectMessage);
        worker.removeEventListener("error", onConnectError);
      };
      const onConnectMessage = (event: MessageEvent<WorkerTransportMessage>) => {
        const message = event.data;
        if (message?.type === "connected") {
          cleanup();
          this.workerConnected = true;
          resolve();
          return;
        }
        if (message?.type === "connect-error") {
          cleanup();
          reject(new Error(message.message ?? `Unable to connect to ${this.url}`));
        }
      };
      const onConnectError = () => {
        cleanup();
        reject(new Error(`Unable to start PlugRelay transport worker.`));
      };
      worker.addEventListener("message", onConnectMessage);
      worker.addEventListener("error", onConnectError);
      worker.postMessage({ type: "connect", url: this.url });
    });
  }

  async hello(): Promise<HelloResponse> {
    return this.request("hello", {});
  }

  async pair(pairingToken: string): Promise<{ sessionToken: string; expiresAt: number }> {
    const response = await this.request<{ sessionToken: string; expiresAt: number }>(
      "pair",
      { origin: this.origin, pairingToken },
      false
    );
    this.sessionToken = response.sessionToken;
    return response;
  }

  scanPlugins(request: PluginScanRequest = {}): Promise<{ plugins: PluginMetadata[]; scannedAt: number }> {
    return this.request("scanPlugins", request);
  }

  listPlugins(request: PluginScanRequest = {}): Promise<{ plugins: PluginMetadata[] }> {
    return this.request("listPlugins", request);
  }

  createInstance(request: CreateInstanceRequest): Promise<CreateInstanceResponse> {
    return this.request("createInstance", request);
  }

  destroyInstance(instanceId: string): Promise<{ destroyed: boolean }> {
    return this.request("destroyInstance", { instanceId });
  }

  getParameters(instanceId: string): Promise<{ parameters: PluginParameter[] }> {
    return this.request("getParameters", { instanceId });
  }

  setParameter(instanceId: string, parameterId: string, normalizedValue: number): Promise<{ parameter: PluginParameter }> {
    return this.request("setParameter", { instanceId, parameterId, normalizedValue });
  }

  setParameterDisplayValue(instanceId: string, parameterId: string, displayValue: string): Promise<{ parameter: PluginParameter }> {
    return this.request("setParameterDisplayValue", { instanceId, parameterId, displayValue });
  }

  setPreset(instanceId: string, presetId: string): Promise<{
    applied: boolean;
    presetId: string;
    parameterCount: number;
    parameters: PluginParameter[];
  }> {
    return this.request("setPreset", { instanceId, presetId });
  }

  getVst3ProgramData(
    instanceId: string,
    programListId: number,
    programIndex: number
  ): Promise<GetVst3ProgramDataResponse> {
    return this.request("getVst3ProgramData", { instanceId, programListId, programIndex });
  }

  setVst3ProgramData(instanceId: string, programData: string): Promise<SetVst3ProgramDataResponse> {
    return this.request("setVst3ProgramData", { instanceId, programData });
  }

  setParameterEvents(instanceId: string, events: ParameterAutomationEvent[]): Promise<{ accepted: boolean; eventCount: number; parameters: PluginParameter[] }> {
    return this.request("setParameterEvents", { instanceId, events });
  }

  setParameterCurve(
    instanceId: string,
    parameterId: string,
    points: ParameterAutomationPoint[],
    interpolation: "linear" | "step" = "linear"
  ): Promise<{ accepted: boolean; eventCount: number; parameter: PluginParameter }> {
    return this.request("setParameterCurve", { instanceId, parameterId, points, interpolation });
  }

  setAutomationLane(instanceId: string, parameterId: string, points: AutomationLanePoint[]): Promise<SetAutomationLaneResponse> {
    return this.request("setAutomationLane", { instanceId, parameterId, points });
  }

  clearAutomationLane(instanceId: string, parameterId?: string): Promise<ClearAutomationLaneResponse> {
    return this.request("clearAutomationLane", { instanceId, parameterId });
  }

  getState(instanceId: string): Promise<{ state: string }> {
    return this.request("getState", { instanceId });
  }

  setState(instanceId: string, state: string): Promise<{ restored: boolean; parameters: PluginParameter[] }> {
    return this.request("setState", { instanceId, state });
  }

  processAudioBlock(request: AudioBlockRequest, timeoutMs = 2000): Promise<AudioBlockResponse> {
    return this.request("processAudioBlock", request, true, timeoutMs);
  }

  processAudioBlockBinary(request: BinaryAudioBlockRequest, timeoutMs = 2000): Promise<AudioBlockResponse> {
    const { channels, ...payload } = request;
    return this.request("processAudioBlock", payload, true, timeoutMs, channels);
  }

  createAudioWorkletTransportConnection(options: AudioWorkletTransportOptions): AudioWorkletTransportConnection | undefined {
    if (this.transport !== "worker" || !this.worker || !this.workerConnected || !this.sessionToken) {
      return undefined;
    }
    const channel = new MessageChannel();
    const sharedAudio = createSharedAudioTransport(options);
    this.worker.postMessage(
      {
        type: "audio-port",
        port: channel.port2,
        instanceId: options.instanceId,
        sampleRate: options.sampleRate,
        sessionToken: this.sessionToken,
        maxInFlightBlocks: boundedAudioWorkletInteger(options.maxInFlightBlocks, 8, 1, 64),
        audioRequestTimeoutMs: boundedAudioWorkletInteger(options.audioRequestTimeoutMs, 2000, 0, 60000),
        audioTransport: options.audioTransport === "json" ? "json" : "binary",
        sharedAudio
      },
      [channel.port2]
    );
    return { port: channel.port1, sharedAudio };
  }

  createAudioWorkletTransportPort(options: AudioWorkletTransportOptions): MessagePort | undefined { return this.createAudioWorkletTransportConnection(options)?.port; }

  sendMidiEvents(instanceId: string, events: MidiEvent[]): Promise<{ accepted: boolean; eventCount: number }> {
    return this.request("sendMidiEvents", { instanceId, events });
  }

  getLatency(instanceId: string, transportLatencySamples = 0): Promise<{
    pluginLatencySamples: number;
    transportLatencySamples: number;
    reportedLatencySamples: number;
  }> {
    return this.request("getLatency", { instanceId, transportLatencySamples });
  }

  getTailTime(instanceId: string): Promise<{
    tailSamples: number;
    infiniteTail: boolean;
  }> {
    return this.request("getTailTime", { instanceId });
  }

  getLayout(instanceId: string): Promise<{
    requestedInputChannels: number;
    requestedOutputChannels: number;
    inputChannels: number;
    outputChannels: number;
    inputBuses: number;
    outputBuses: number;
    inputBusLayouts: Array<{
      index: number;
      direction: "input" | "output";
      mediaType: "audio";
      name: string;
      type: "main" | "aux" | "unknown";
      channels: number;
      active: boolean;
    }>;
    outputBusLayouts: Array<{
      index: number;
      direction: "input" | "output";
      mediaType: "audio";
      name: string;
      type: "main" | "aux" | "unknown";
      channels: number;
      active: boolean;
    }>;
    sampleRate: number;
    maxBlockSize: number;
  }> {
    return this.request("getLayout", { instanceId });
  }

  openEditor(instanceId: string, mode: "generic" | "native" = "generic"): Promise<OpenEditorResponse> {
    return this.request("openEditor", { instanceId, mode });
  }

  closeEditor(editorId: string): Promise<CloseEditorResponse> {
    return this.request("closeEditor", { editorId });
  }

  createFileGrant(request: CreateFileGrantRequest): Promise<FileGrant> {
    return this.request("createFileGrant", request);
  }

  listFileGrants(): Promise<{ grants: FileGrant[] }> {
    return this.request("listFileGrants", {});
  }

  revokeFileGrant(grantId: string): Promise<{ revoked: boolean; grantId: string }> {
    return this.request("revokeFileGrant", { grantId });
  }

  attachFileGrant(
    instanceId: string,
    grantId: string,
    constraints: Pick<CreateFileGrantRequest, "purpose" | "access" | "kind"> = {}
  ): Promise<{ attached: boolean; instanceId: string; grant: FileGrant & { attachedAt: number } }> {
    return this.request("attachFileGrant", { instanceId, grantId, ...constraints });
  }

  listInstanceFileGrants(instanceId: string): Promise<{ instanceId: string; grants: Array<FileGrant & { attachedAt: number }> }> {
    return this.request("listInstanceFileGrants", { instanceId });
  }

  detachFileGrant(instanceId: string, grantId: string): Promise<{ detached: boolean; instanceId: string; grantId: string }> {
    return this.request("detachFileGrant", { instanceId, grantId });
  }

  useFileGrant(
    instanceId: string,
    grantId: string,
    options: {
      operation?: FileGrantOperation;
      purpose?: CreateFileGrantRequest["purpose"];
      access?: CreateFileGrantRequest["access"];
      kind?: CreateFileGrantRequest["kind"];
    } = {}
  ): Promise<{
    accepted: boolean;
    applied: boolean;
    instanceId: string;
    operation: FileGrantOperation;
    grant: FileGrant;
    workerStatus?: string;
  }> {
    return this.request("useFileGrant", { instanceId, grantId, ...options });
  }

  heartbeat(): Promise<{ now: number }> { return this.request("heartbeat", { now: Date.now() }); }

  private request<TPayload>(
    command: ProtocolCommand,
    payload: unknown,
    includeSession = true,
    timeoutMs = this.requestTimeoutMs,
    binaryAudioChannels?: ArrayLike<number>[]
  ): Promise<TPayload> {
    if (this.transport === "main") {
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("PlugRelay socket is not connected."));
      }
    } else if (!this.worker || !this.workerConnected) {
      return Promise.reject(new Error("PlugRelay worker transport is not connected."));
    }

    const id = `req-${++this.requestSeq}`;
    const envelope: RequestEnvelope = {
      type: "request",
      id,
      command,
      payload: (payload ?? {}) as object
    };

    if (includeSession && this.sessionToken) {
      envelope.sessionToken = this.sessionToken;
    }

    return new Promise((resolve, reject) => {
      const timeout = timeoutMs > 0 ? globalThis.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`PlugRelay request timed out: ${command}`));
      }, timeoutMs) : undefined;
      this.pending.set(id, { resolve: resolve as (payload: unknown) => void, reject, timeout });
      if (this.transport === "worker") {
        this.worker?.postMessage({ type: "request", envelope, binaryAudioChannels, timeoutMs });
      } else {
        this.socket?.send(
          binaryAudioChannels ? encodeBinaryAudioEnvelope(envelope, binaryAudioChannels) : JSON.stringify(envelope)
        );
      }
    });
  }

  private handleMessage(data: unknown): void {
    let envelope: ResponseEnvelope | { type: "event"; event: string; payload: unknown };
    try {
      envelope = typeof data === "string" ? JSON.parse(data) : decodeBinaryAudioEnvelope(data);
    } catch {
      return;
    }

    this.handleEnvelope(envelope);
  }

  private handleWorkerMessage(message: WorkerTransportMessage): void {
    if (message?.type === "message" && message.envelope) {
      this.handleEnvelope(message.envelope);
      return;
    }
    if (message?.type === "send-error" && message.id) {
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(message.id);
        pending.reject(new Error(message.message ?? "PlugRelay worker transport send failed."));
      }
      return;
    }
    if (message?.type === "closed") {
      this.workerConnected = false;
      this.rejectPendingRequests("PlugRelay worker transport closed before response");
      this.dispatchEvent(new CustomEvent("disconnect"));
    }
  }

  private handleEnvelope(envelope: ResponseEnvelope | { type: "event"; event: string; payload: unknown }): void {
    if (envelope.type === "event") {
      this.dispatchEvent(new CustomEvent(envelope.event, { detail: envelope.payload }));
      return;
    }

    if (envelope.type !== "response") {
      return;
    }

    const pending = this.pending.get(envelope.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(envelope.id);

    if (envelope.ok) {
      pending.resolve(envelope.payload);
      return;
    }

    const error = envelope.error ?? { code: "unknown_error", message: "Unknown PlugRelay protocol error." };
    pending.reject(new PlugRelayProtocolError(error.code, error.message, error.details));
  }

  private rejectPendingRequests(message: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`${message} ${id}.`));
    }
    this.pending.clear();
  }
}

function boundedAudioWorkletInteger(value: unknown, fallback: number, min: number, max: number): number {
  const integer = Math.floor(Number(value ?? fallback));
  return Number.isFinite(integer) ? Math.max(min, Math.min(max, integer)) : fallback;
}
export { decodeBinaryAudioEnvelope as __plugRelayDecodeBinaryAudioEnvelope, encodeBinaryAudioEnvelope as __plugRelayEncodeBinaryAudioEnvelope };
