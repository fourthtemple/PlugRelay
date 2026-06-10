# Web DAW Integration

SoundBridge should feel like an AudioNode plus a plugin-management API.

## Minimal Host Flow

1. Create `AudioContext`.
2. Create `SoundBridgeClient` with `ws://127.0.0.1:47370/bridge`.
3. Call `connect()`, `hello()`, and `pair()`.
4. Call `scanPlugins()` or `listPlugins()`.
5. Create a plugin instance with the current sample rate and block size.
6. Create `SoundBridgeAudioNode`.
7. Connect source nodes into the bridge node and connect the bridge node to the destination.
8. For instruments, send notes or MIDI clips through `sendMidiEvents()`.
9. Render generic parameter controls or bind host automation to `setParameter()`.
10. Store `getState()` output in the DAW project.
11. Restore using `setState()` when reopening the project.

## WebAudioModules Compatibility

The first compatibility target is an adapter that exposes:

- descriptor metadata from `listPlugins()`
- format-aware plugin identity for VST3, AU, LV2, and mock plugins
- an AudioNode-like instance backed by `SoundBridgeAudioNode`
- normalized parameter automation
- opaque state serialization
- generic parameter UI fallback

The adapter should not require hosts to adopt SoundBridge-specific UI primitives.

## Host Responsibilities

Hosts should:

- clearly show when audio is being routed through a local daemon
- store opaque plugin state without editing it
- account for `getLatency()` in timeline scheduling and monitoring UI
- degrade gracefully when the daemon disconnects
- avoid real-time assumptions until the transport reports stable timing

## Current Prototype Limitations

- JSON audio blocks are for correctness testing, not final latency.
- Parameter automation is block-rate.
- The mock plugin is a gain effect.
- The demo uses a `MessagePort` queue between main thread and AudioWorklet for compatibility.
- Native VST3 and LV2 instantiation is staged behind the C++ scanner skeleton and future per-format host adapters; installed Audio Units can instantiate and render through the CoreAudio worker.
- The website-playable VST3/AU/LV2 instruments are repo-local example bundles rendered by the native example renderer; full VST3 SDK and LV2 binary DSP hosting plus deeper AU parameter/state support are still next native milestones.
