# Security Model

SoundBridge exposes native audio plugins to browser origins. That is powerful, so the default posture must be narrow and explicit.

This is also why browser-to-native plugin bridges should converge on an auditable open standard. A web origin that can ask a local companion app to scan or load VST3, Audio Unit, or LV2 plugins is crossing the browser sandbox into native code. See [Why Browser Plugin Bridges Need An Open Standard](open-standard.md).

## Threat Model

Risks:

- a malicious website tries to scan installed plugins
- a site attempts to load plugins without user consent
- a plugin state blob is abused as a filesystem or code execution path
- a compromised plugin crashes or attacks the daemon
- an origin reuses an old session token
- a paired origin tries to control another origin's plugin instance
- one browser host tries to exhaust local plugin worker resources
- the daemon accidentally binds a non-loopback interface

Non-goals for the MVP:

- protecting against a fully compromised local user account
- sandboxing every third-party plugin on day one
- exposing native plugin editors to arbitrary browser frames

## Required Controls

- Bind to `127.0.0.1` and `::1` only by default.
- Require pairing before scan, list, instantiate, parameter, state, or audio commands.
- Keep unpaired `hello` responses minimal; detailed plugin-host capabilities require pairing.
- Require a WebSocket `Origin` header before pairing.
- Maintain an origin allowlist.
- Use short-lived session tokens.
- Bind session tokens to the origin and browser connection that paired them.
- Make plugin instances session-owned and reject cross-session `instanceId` access.
- Destroy session-owned plugin instances when the browser connection closes.
- Enforce per-session and daemon-wide plugin instance limits.
- Cap WebSocket message size before pairing.
- Prompt natively for new origins in the production daemon.
- Do not expose arbitrary filesystem access.
- Do not expose plugin paths unless diagnostics are explicitly enabled.
- Treat plugin state as opaque bytes and pass it only to the plugin instance that produced it.
- Run plugin DSP in a worker process where practical.
- Restart crashed plugin workers without killing the daemon.
- Keep VST3, AU, and LV2 host adapters behind the same pairing and origin checks.
- Prefer per-format worker processes so a crash or exploit in one plugin stack cannot poison all native hosting.

## Development Token

The mock daemon generates an ephemeral pairing token each time it starts and prints it to the local terminal. `SOUNDBRIDGE_PAIRING_TOKEN` exists for controlled automation and test fixtures; do not ship a public static token. The real macOS daemon should show a native confirmation prompt with the requesting origin.

The development daemon now enforces the important multi-host boundaries even with the simple token flow:

- sessions are bound to the WebSocket connection and Origin header that paired them
- plugin instances are owned by the creating session
- commands for another session's `instanceId` fail with `instance_access_denied`
- disconnecting a WebSocket destroys its session-owned plugin workers
- quotas default to 8 instances per session and 32 instances total

Those defaults can be adjusted for testing with `SOUNDBRIDGE_MAX_INSTANCES_PER_SESSION`, `SOUNDBRIDGE_MAX_TOTAL_INSTANCES`, `SOUNDBRIDGE_MAX_SESSIONS_PER_ORIGIN`, `SOUNDBRIDGE_SESSION_TTL_MS`, and `SOUNDBRIDGE_MAX_WEBSOCKET_MESSAGE_BYTES`.

Set `SOUNDBRIDGE_ALLOWED_ORIGINS` to a comma-separated list to restrict pairing to known sites:

```sh
SOUNDBRIDGE_ALLOWED_ORIGINS=https://your-daw.example,http://127.0.0.1:5173 npm run bridge
```

The daemon refuses non-loopback binds unless `SOUNDBRIDGE_ALLOW_NON_LOOPBACK=1` is set. The demo server has the same guard through `SOUNDBRIDGE_DEMO_ALLOW_NON_LOOPBACK=1` and only serves the browser demo plus the built web-client bundle.

## Browser Headers

The reference demo sets:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

These headers prepare the demo for `SharedArrayBuffer` ring buffers. The current mock path works without shared memory, but production low-latency transports should prefer it when available.
