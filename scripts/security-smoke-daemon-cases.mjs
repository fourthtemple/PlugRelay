import { spawn } from "node:child_process";
import {
  connect,
  requestEnvelope,
  sendCloseFrame,
  sendOversizedTextFrame,
  waitForClose
} from "./security-smoke-client.mjs";

export function createSecurityDaemonCases({
  check,
  disallowedOrigin,
  host,
  origin,
  port,
  request,
  token
}) {
  async function checkOriginAllowlist() {
    const allowlistPort = port + 1;
    const allowlisted = spawn("node", ["scripts/mock-daemon.mjs"], {
      env: {
        ...process.env,
        SOUNDBRIDGE_HOST: host,
        SOUNDBRIDGE_PORT: String(allowlistPort),
        SOUNDBRIDGE_PAIRING_TOKEN: token,
        SOUNDBRIDGE_ALLOWED_ORIGINS: origin
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    allowlisted.stderr.on("data", () => {});
    try {
      await waitForListen(allowlisted);
      const denied = await connect(host, allowlistPort, `${host}:${allowlistPort}`, disallowedOrigin);
      const deniedPair = await request(
        denied,
        "pair",
        { origin: disallowedOrigin, pairingToken: token },
        false
      ).then(
        () => ({ ok: true }),
        (error) => ({ code: error.code })
      );
      check(deniedPair.code === "origin_not_allowed", "origin allowlist rejects unapproved browser origins");
      denied.socket?.destroy();

      const approved = await connect(host, allowlistPort, `${host}:${allowlistPort}`, origin);
      const approvedPair = await request(approved, "pair", { origin, pairingToken: token }, false);
      check(
        typeof approvedPair.sessionToken === "string" && approvedPair.sessionToken.length > 0,
        "origin allowlist accepts approved browser origins"
      );
      const hello = await request(approved, "hello", {}, true, approvedPair.sessionToken);
      check(hello.capabilities?.security?.originAllowlist === true, "hello advertises active origin allowlist");
      approved.socket?.destroy();
    } finally {
      allowlisted.kill("SIGKILL");
    }
  }

  async function checkPrePairingMessageSizeCap() {
    const cappedPort = port + 2;
    const capped = spawn("node", ["scripts/mock-daemon.mjs"], {
      env: {
        ...process.env,
        SOUNDBRIDGE_HOST: host,
        SOUNDBRIDGE_PORT: String(cappedPort),
        SOUNDBRIDGE_PAIRING_TOKEN: token,
        SOUNDBRIDGE_MAX_WEBSOCKET_MESSAGE_BYTES: "128"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    capped.stderr.on("data", () => {});
    try {
      await waitForListen(capped);
      const oversized = await connect(host, cappedPort, `${host}:${cappedPort}`, origin);
      sendOversizedTextFrame(oversized, 129);
      check(await waitForClose(oversized), "oversized pre-pairing WebSocket frames are rejected");
    } finally {
      capped.kill("SIGKILL");
    }
  }

  async function checkRequestEnvelopeValidation() {
    const ctx = await connect(host, port, `${host}:${port}`, origin);
    try {
      for (const [envelope, code, message] of [
        [
          { type: "request", id: "missing-payload", command: "hello" },
          "bad_payload",
          "request envelopes require a payload object"
        ],
        [
          { type: "request", id: "null-payload", command: "hello", payload: null },
          "bad_payload",
          "request envelopes reject null payloads"
        ],
        [
          { type: "request", id: "array-payload", command: "hello", payload: [] },
          "bad_payload",
          "request envelopes reject array payloads"
        ],
        [
          { type: "request", id: "missing-command", payload: {} },
          "bad_command",
          "request envelopes require a known command"
        ],
        [
          { type: "request", id: "unknown-command", command: "scanSecrets", payload: {} },
          "bad_command",
          "request envelopes reject unknown commands"
        ],
        [
          { type: "request", id: "bad-session", command: "hello", payload: {}, sessionToken: 42 },
          "bad_envelope",
          "request envelopes reject non-string session tokens"
        ],
        [
          { type: "request", id: "", command: "hello", payload: {} },
          "bad_envelope",
          "request envelopes reject empty ids"
        ],
        [
          { type: "request", id: "extra-field", command: "hello", payload: {}, unexpected: true },
          "bad_envelope",
          "request envelopes reject unsupported top-level fields"
        ]
      ]) {
        const result = await requestEnvelope(ctx, envelope).then(
          () => ({ ok: true }),
          (error) => ({ code: error.code })
        );
        check(result.code === code, message);
      }
    } finally {
      ctx.socket?.destroy();
    }
  }

  async function checkDisconnectCleansUpInstances() {
    const cleanupPort = port + 3;
    const cleanupDaemon = spawn("node", ["scripts/mock-daemon.mjs"], {
      env: {
        ...process.env,
        SOUNDBRIDGE_HOST: host,
        SOUNDBRIDGE_PORT: String(cleanupPort),
        SOUNDBRIDGE_PAIRING_TOKEN: token,
        SOUNDBRIDGE_MAX_TOTAL_INSTANCES: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    cleanupDaemon.stderr.on("data", () => {});
    try {
      await waitForListen(cleanupDaemon);
      const owner = await connect(host, cleanupPort, `${host}:${cleanupPort}`, origin);
      const ownerPair = await request(owner, "pair", { origin, pairingToken: token }, false);
      await request(owner, "createInstance", { pluginId: "mock.gain" }, true, ownerPair.sessionToken);

      const other = await connect(host, cleanupPort, `${host}:${cleanupPort}`, origin);
      const otherPair = await request(other, "pair", { origin, pairingToken: token }, false);
      const blocked = await request(other, "createInstance", { pluginId: "mock.gain" }, true, otherPair.sessionToken).then(
        () => ({ ok: true }),
        (error) => ({ code: error.code })
      );
      check(blocked.code === "quota_exceeded", "live session-owned instances count against daemon-wide quotas");

      sendCloseFrame(owner);
      await waitForClose(owner);
      const afterDisconnect = await createInstanceAfterDisconnectCleanup(other, otherPair.sessionToken);
      check(
        typeof afterDisconnect?.instanceId === "string",
        "disconnecting a WebSocket destroys session-owned plugin instances"
      );
      other.socket?.destroy();
    } finally {
      cleanupDaemon.kill("SIGKILL");
    }
  }

  async function createInstanceAfterDisconnectCleanup(ctx, sessionToken) {
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      const result = await request(ctx, "createInstance", { pluginId: "mock.gain" }, true, sessionToken).then(
        (payload) => ({ payload }),
        (error) => ({ code: error.code })
      );
      if (result.payload) {
        return result.payload;
      }
      if (result.code !== "quota_exceeded") {
        return undefined;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  }

  return {
    checkDisconnectCleansUpInstances,
    checkOriginAllowlist,
    checkPrePairingMessageSizeCap,
    checkRequestEnvelopeValidation
  };
}

export function waitForListen(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("daemon did not start")), 8000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("listening")) {
        clearTimeout(timer);
        setTimeout(resolve, 150);
      }
    });
    child.on("exit", (code) => reject(new Error(`daemon exited early code=${code}`)));
  });
}
