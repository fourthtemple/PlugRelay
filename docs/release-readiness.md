# Release Readiness

This document defines the terms SoundBridge should use in release notes, compatibility dashboards, and host UI labels. It is intentionally narrower than "every plugin works": a status is meaningful only for the specific format, host profile, and feature buckets that were probed.

## Compatibility Status Terms

`works` means the plugin was instantiated through a supported compatibility-worker profile and the bounded probe phases for that status completed. A plugin can work for scanning, parameters, state, MIDI, rendering, bus layouts, latency, or editor behavior independently; release notes should name the buckets that passed instead of implying total product coverage.

`discovery-only` means SoundBridge can expose bounded, path-free metadata but must not instantiate the plugin yet. Public plugin listings should set `hostable: false`, include a path-free `hostUnavailableReason`, and reject `createInstance` with `plugin_not_hostable`. Discovery-only entries are useful compatibility leads, not failures in a supported profile.

`unsupported profile` means the scanner recognized a profile, extension, lifecycle, or bus shape that has no bounded host contract yet. Examples include offline render lifecycles, utility profiles that need special source/destination handling, or declared LV2 requirements outside the current extension set. Unsupported profiles should stay discovery-only until the profile has protocol docs, worker behavior, and smoke coverage.

`failed` means a plugin entered a supported host path and a bounded phase failed, timed out, crashed, produced an invalid response, or returned a path-redacted error. Failures should be triaged with a probe report and should not be converted into plugin-specific hacks when a format-level fixture can reproduce the behavior.

`unknown` means no current probe result exists for the requested feature bucket, format, or host profile. Hosts should prefer `unknown` over assuming support from a scan result alone.

## Release Profiles

The core release target is `compatibility-worker`: plugin DSP runs in a separate worker process under the normal user environment, while browser and desktop hosts only receive the bounded SoundBridge protocol.

`brokered-files` and `native-editor-broker` are production-readiness requirements for workflows that cross beyond simple DSP. Browser responses must stay path-free, and native editor code must stay outside the daemon.

`sandboxed-worker` and `network-restricted-worker` are extended hardening profiles. They may be valuable for stricter deployments, but they should not be described as prerequisites for the core compatibility release because they can break plugins that depend on normal desktop DAW license, cache, sample, helper-service, or authorization behavior.

## Compatibility Matrix Rules

Compatibility matrix entries should be built from path-free probe reports. A matrix entry should include the SoundBridge commit or release, platform, architecture, plugin format, host profile, plugin kind, and feature buckets that passed, failed, or were not requested.

Public repository docs and tests should keep using neutral plugin examples. A public matrix can display plugin identity only when the report submitter intentionally provided public identity fields; release notes should otherwise prefer aggregate counts and feature coverage.

Treat matrix results as compatibility evidence, not certification. A `works` entry means the bounded probe passed for that environment and feature set; it does not guarantee every vendor preset format, sample-library path, cache behavior, license flow, native editor interaction, or offline workflow is covered.

## Protocol Evolution

Every daemon must report a semantic `hello.protocolVersion`. Hosts should use the major version for compatibility checks, then gate behavior with `hello.capabilities` and per-plugin metadata such as `hostable`, `editorKinds`, `fileGrantOperations`, format-specific profiles, and feature coverage.

Backward-compatible changes are additive: optional fields, new capabilities defaulting to absent or `false`, new per-plugin metadata, and new commands that older hosts can ignore. Clients must ignore unknown response fields because the schemas allow additional properties for forward compatibility.

New enum-like status strings should be documented with an unknown-safe fallback. Hosts should render unknown statuses as `unknown` or a generic unsupported state instead of treating them as success.

Breaking changes require a major `protocolVersion` increment. Breaking changes include removing required fields, changing command ownership or path-redaction semantics, narrowing accepted payloads without a capability flag, changing the meaning of an existing status, or returning private filesystem data through a browser response.

When possible, deprecate before breaking: keep the old field or command for at least one release line, add a replacement capability, document the migration, and keep the daemon response bounded for both old and new clients.

Protocol versioning does not replace feature negotiation. A host should not call a file-grant operation, native editor command, bus-routing path, or format-specific workflow unless the daemon and selected plugin both advertise support for that workflow.

## Production Gate

The core compatibility release is ready when a normal user can install the bridge, approve a site, scan plugins, instantiate supported profiles, process audio, restore state, use brokered file workflows, recover from worker failures, and understand unsupported profiles without reading internal implementation notes.

Release blockers should be tracked against the concrete buckets in the roadmap: packaging and signing, first-run approval, origin management, compatibility matrix ingestion, native editor brokering, file-grant UX, crash/error reporting, binary/low-latency transport, and release documentation.
