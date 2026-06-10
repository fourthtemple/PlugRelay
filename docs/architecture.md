# Architecture

SoundBridge splits browser audio hosting from native plugin hosting. The browser never loads VST3, Audio Unit, or LV2 code. It captures or generates Web Audio blocks, moves them to an `AudioWorklet`, and exchanges audio/control messages with a local daemon that owns native plugin discovery, instantiation, DSP, state, latency, and crash containment.

## Components

### Browser SDK

The SDK is a small TypeScript package that gives Web DAWs:

- a `SoundBridgeClient` for pairing, scanning, plugin instantiation, parameter changes, state, and latency
- a `SoundBridgeAudioNode` wrapper around `AudioWorkletNode`
- generic parameter UI helpers for hosts that do not have their own plugin UI
- protocol message types shared with daemon implementations
- format-aware plugin metadata for VST3, AU, LV2, and mock/test plugins

The `AudioWorkletProcessor` never blocks. It copies input blocks into a queue, posts them to the main thread, and consumes returned processed blocks when available. If the queue underruns, it falls back to dry audio for the block and reports underrun stats. A production build should move the socket work into a dedicated worker and use `SharedArrayBuffer` ring buffers when cross-origin isolation is available.

### Local Bridge Daemon

The daemon listens on loopback only. It provides:

- plugin scanning for VST3, Audio Unit, and LV2 search paths
- pairing and origin allowlisting
- plugin instance lifecycle
- parameter metadata and normalized values
- audio block processing
- opaque state save/restore
- latency and error reporting

The mock daemon in this repository implements the protocol with a stereo gain effect, which lets Web DAWs integrate and measure the transport before native plugin hosting is complete.

### Native Plugin Hosts

The macOS-first native daemon is C++17 today. C++ is the conservative choice because the VST3 SDK, JUCE, Audio Unit APIs, LV2 hosting stacks, real-time thread rules, and plugin crash isolation patterns are best supported there. The current skeleton performs real bundle discovery for VST3, AU, and LV2, then isolates future DSP hosting behind per-format host adapters.

Format support is intentionally split:

| Format | Scanner | Hosting Path | Notes |
| --- | --- | --- | --- |
| VST3 | Active macOS bundle scanner with plist metadata | Steinberg VST3 SDK adapter | First real DSP target. Keep SDK optional and review licensing before vendoring. |
| AU | Active macOS `.component` scanner plus AudioComponent registry metadata | Active CoreAudio AudioComponent worker | macOS-only. Runs installed AU binaries in a separate worker process. |
| LV2 | Active `.lv2` bundle scanner | Optional LV2 stack adapter such as Lilv | Important for open-source plugin ecosystems; keep GPL components out of the core. |

The native daemon also exposes repo-local VST3/AU/LV2 example bundles through `--scan-examples`. The native build installs a small Mach-O helper into each example bundle, and the browser demo daemon launches a long-lived worker from that bundle executable per plugin instance. Note events are sent into that worker, and render calls advance worker-owned oscillator state across audio blocks. This means the website exercises scanned AU/VST/LV2 example bundle metadata plus native C++ example DSP over a worker-process boundary. Installed Audio Units use a real CoreAudio worker today; full VST3 SDK and LV2 binary hosting remain isolated behind future host adapters.

The intended production topology is:

```mermaid
flowchart LR
  WebDAW["Web DAW"] --> Worklet["AudioWorklet"]
  Worklet --> SDK["SoundBridge SDK"]
  SDK --> WS["Local WebSocket"]
  WS --> Daemon["Bridge Daemon"]
  Daemon --> Worker["Plugin Worker Process"]
  Worker --> Plugin["VST3/AU/LV2 Plugin"]
```

The worker process boundary is important. A bad plugin should be able to kill its own worker without taking down the daemon, browser, or other plugin instances.

## Language And Framework Choices

Browser:

- TypeScript for SDK and protocol types.
- Plain Web Audio and AudioWorklet APIs for maximum host compatibility.
- No framework dependency for the reference UI.
- WebSocket first because it works in Safari, Chrome, and Firefox and is easy for Web DAWs to adopt.

Native:

- C++17 for the daemon and native hosting layer.
- CMake for cross-platform build hygiene, even though macOS is first.
- Optional future JUCE adapter may speed up VST3/AU hosting and plugin editor work, but the core protocol should not require JUCE.
- LV2 should use a permissively compatible adapter path. Lilv and related libraries are common LV2 choices, but their licenses and transitive dependencies must be reviewed before becoming core dependencies.
- No GPL dependencies in the core. Carla can remain an optional backend experiment, not a required dependency.

Protocol:

- JSON request/response envelopes first for debuggability and schema stability.
- Audio blocks are JSON arrays in the mock daemon to keep the zero-dependency prototype simple.
- The protocol reserves a binary audio transport for later WebSocket binary frames, WebRTC data channels, shared memory, or a browser-native helper transport.

## AudioGridder As Prior Art

AudioGridder is the closest open-source reference for native-side problems: scanning, native plugin hosting, server/client lifecycle, VST3/AU support, audio/MIDI transport, parameter automation, latency compensation, and UI streaming. It is not the starting core because:

- its client is a native DAW plugin rather than a browser/Web Audio client
- its transport and scheduling assumptions differ from AudioWorklet constraints
- broad Web DAW adoption benefits from a small permissive SDK and open protocol
- dependency and licensing review must happen before reusing or porting code
- the project appears less active than a new browser-native standard needs

SoundBridge should study AudioGridder's architecture and failure modes, then selectively port ideas only after license, dependency, and maintainability review.

AudioGridder is less directly useful for LV2 because its strongest reference value is VST3/AU-style native hosting and remote-plugin lifecycle. SoundBridge should still reuse the architectural lessons around workers, transport, and compensation for LV2.

## Latency Tradeoffs

The MVP prioritizes correctness over ultra-low latency. WebSocket plus JSON audio blocks is not a final real-time transport. It is useful because it exposes:

- browser scheduling behavior
- AudioWorklet queue depth requirements
- daemon processing timing
- round-trip jitter
- browser-specific limitations, especially Safari

The production path should add:

- binary audio frames
- a dedicated browser worker for transport
- `SharedArrayBuffer` ring buffers where available
- adaptive buffering and latency compensation
- daemon-side plugin worker processes
- a transport abstraction that can support WebRTC data channels or shared-memory helpers later

## Safari Compatibility

Safari supports AudioWorklet in current versions, but the safest cross-browser design avoids relying on WebSocket directly inside the worklet. This prototype keeps socket ownership outside the worklet and communicates through `MessagePort`, which is less efficient but more compatible.
