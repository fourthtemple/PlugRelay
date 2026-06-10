# SoundBridge

SoundBridge is an open browser-to-native audio plugin bridge prototype. It lets a Web Audio host talk to a local native daemon that owns native plugin loading, plugin DSP, state, parameters, latency reporting, and eventually native editor integration.

The native side is being designed for full VST3, Audio Unit, and LV2 support. Those formats share one browser protocol and plugin metadata model, but each native backend stays isolated behind its own scanner and host adapter so licensing, platform APIs, and crash behavior can be handled correctly.

The first implementation slice is intentionally modest:

- a documented localhost WebSocket protocol
- a TypeScript browser SDK and AudioWorklet processor
- a dependency-free Node mock daemon with a stereo gain effect plus example VST3/AU/LV2 instrument facades
- a browser demo that processes microphone/audio-file input and plays the example instruments through the daemon
- a macOS-first C++ native daemon skeleton with VST3, Audio Unit, and LV2 discovery hooks plus AU and optional VST3 host workers

AudioGridder is treated as prior art for the native hard parts, especially plugin hosting, client/server separation, transport, latency compensation, and UI streaming. SoundBridge starts clean because its first-class client is the browser/Web Audio runtime, not a native DAW plugin.

## Quick Start

Run the mock daemon:

```sh
npm run mock:daemon
```

In another terminal, serve the browser demo:

```sh
npm run demo
```

Open <http://127.0.0.1:5173>. The development pairing token is `dev-token` unless `SOUNDBRIDGE_PAIRING_TOKEN` is set.

The mock daemon exposes:

- `[Mock] SoundBridge Mock Gain`
- `[VST3] SoundBridge Example PolySynth · built-in example`
- `[AU] SoundBridge Example Tonewheel · built-in example`
- installed Audio Units as hostable native plugins when they expose AudioComponent metadata
- installed VST3 audio effects as hostable native plugins when the Steinberg SDK host worker is linked
- installed LV2 scan results from the native scanner as disabled `scan only` entries when present

The VST3/AU/LV2 entries are intentionally simple repo-local example bundles under `native/example-plugins/`. They use `.vst3`, `.component`, and `.lv2` bundle layouts plus `SoundBridgePlugin.json` manifests, are discovered by the native scanners, and use the same website-to-daemon protocol path as real native plugins. After the native build, each bundle contains a Mach-O helper executable; the website daemon keeps a long-lived helper worker per plugin instance, sends note events into that worker, and renders through the bundle executable with oscillator state preserved across blocks. A JavaScript fallback is still available for development. They are not full VST3 SDK, AudioComponent, or LV2 binary plugins yet.

The example bundle manifests also declare simple presets. The browser demo exposes those presets and applies them through normal parameter changes, so the example instruments exercise scanning, instantiation, MIDI, parameter control, state, presets, and audio rendering through the same website protocol.

Installed Audio Unit scan results with registry metadata are hostable through a CoreAudio worker process. Installed VST3 audio-effect bundles are hostable through the optional Steinberg SDK worker when `SOUNDBRIDGE_VST3_SDK_PATH` points at a SDK checkout or the local development SDK path is present. Installed LV2 scan results are still discovery-only for now: the browser demo shows them as `scan only`, disables selection, and the protocol rejects `createInstance` with `plugin_not_hostable` until the LV2 binary host adapter is linked.

## Repository Layout

```text
packages/
  web-client/          TypeScript SDK, AudioWorklet processor, generic UI helpers
  protocol/            Shared protocol schema and TypeScript message types
native/
  bridge-daemon/       macOS-first native daemon skeleton and VST3/AU/LV2 scanners
docs/
  architecture.md      Technical architecture and tradeoffs
  protocol.md          Transport and message contract
  security.md          Local pairing, origin allowlist, and threat model
  daw-integration.md   Web DAW integration model
examples/
  browser-demo/        Reference browser host demo
installer/
  macos/               Packaging, launch agent, and Homebrew notes
scripts/
  mock-daemon.mjs      Development daemon with a mock gain plugin
  demo-server.mjs      Static server for the demo and SDK files
  browser-smoke.mjs    Headless browser verification for the website instrument path
```

## Native Skeleton

Build the native scanner skeleton:

```sh
cmake -S native/bridge-daemon -B native/bridge-daemon/build
cmake --build native/bridge-daemon/build
native/bridge-daemon/build/soundbridge-daemon --scan
```

The skeleton does real bundle discovery for VST3, Audio Unit, and LV2 search paths. Audio Unit plugins can be instantiated and rendered through the native CoreAudio worker. VST3 audio-effect bundles can be instantiated and rendered through the Steinberg SDK worker when the SDK is available at configure time. LV2 still needs its optional stack adapter before installed binaries become hostable.

The browser-facing `hello` capabilities are derived from the native `--host-status` command: scanning and example-bundle hosting are advertised separately from full installed-plugin binary hosting, and native status notes are surfaced in the demo.

Focused scanner commands are available while developing format backends:

```sh
native/bridge-daemon/build/soundbridge-daemon --scan-vst3
native/bridge-daemon/build/soundbridge-daemon --scan-au
native/bridge-daemon/build/soundbridge-daemon --scan-lv2
native/bridge-daemon/build/soundbridge-daemon --scan-examples
native/bridge-daemon/build/soundbridge-daemon --scan-installed
native/bridge-daemon/build/soundbridge-daemon --host-status
native/bridge-daemon/build/soundbridge-daemon --host-vst3-worker "/Library/Audio/Plug-Ins/VST3/Example.vst3" 48000 128 2 2 effect
native/bridge-daemon/build/soundbridge-daemon --render-example-block vst3:soundbridge-example-polysynth.vst3 128 48000 0.42 0.68 0.5 60:0.8
```

`--scan` returns installed plugin bundles plus the repo-local example bundles. `--scan-installed` returns only discovered non-example plugin bundles; the browser protocol exposes hostable AU/VST3 metadata without raw executable paths and keeps LV2 installed plugins scan-only. `--scan-examples` returns only the website-playable AU/VST/LV2 example bundles.

## Verification

With the mock daemon and demo server running:

```sh
npm run smoke:mock
npm run smoke:browser
```

`smoke:mock` validates the protocol path directly, including installed AU rendering through `renderEngine: "native-au"`, installed VST3 rendering through `renderEngine: "native-vst3"`, plus note-on/note-off events and rendered audio from the example VST3/AU/LV2 instruments. For repo-local example bundles, it expects `renderEngine: "bundle-worker"` and verifies a second audio block continues without resending note state, then verifies audio stops after note-off. `smoke:browser` drives the website in Chrome, plays each example instrument through the browser UI, and verifies the page reports `Bundle worker` as the render engine.

## License

MIT. The browser SDK, protocol, and core bridge should stay permissively licensed to encourage adoption by commercial and open-source Web DAWs.
