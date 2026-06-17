import {
  summarizeProbeMidiControllerEvents,
  summarizeProbeMidiProgramChangeEvents,
  summarizeProbeMidiTiming
} from "./installed-plugin-probe-midi.mjs";
import { summarizeProbeResults } from "./installed-plugin-probe-reporting.mjs";

export function exerciseInstalledProbeMidiSupport({ check }) {
  const controllerProfile = summarizeProbeMidiControllerEvents([
    { type: "controlChange", controller: 74, value: 0.5, channel: 0, busIndex: 0 },
    { type: "channelPressure", pressure: 0.25, channel: 1, busIndex: 1 },
    { type: "pitchBend", value: -0.5, channel: 2, busIndex: 1 }
  ]);
  const controllerMatrix = summarizeProbeResults([{
    ok: true,
    format: "vst3",
    midiControllerEventProfile: controllerProfile
  }]).matrix[0];
  check(
    controllerProfile.controllerFamilyCount === 3 &&
      JSON.stringify(controllerProfile.controllers) === JSON.stringify([74, 128, 129]) &&
      JSON.stringify(controllerMatrix.midiControllerNumbers) === JSON.stringify([74, 128, 129]),
    "installed plugin probe reports VST3 MIDI controller-family ids"
  );

  const typedControllerProfile = summarizeProbeMidiControllerEvents([
    { type: "controlChange", controller: "74", value: "0.5", channel: "2", busIndex: "1" },
    { type: "pitchBend", value: "", channel: true, busIndex: "" },
    { type: "channelPressure", pressure: false, channel: 0, busIndex: 0 }
  ]);
  check(
    typedControllerProfile.eventCount === 3 &&
      typedControllerProfile.invalidControllerValueCount === 2 &&
      typedControllerProfile.invalidControllerRouteCount === 1 &&
      JSON.stringify(typedControllerProfile.controllers) === JSON.stringify([74, 128, 129]) &&
      JSON.stringify(typedControllerProfile.channels) === JSON.stringify([0, 2]) &&
      JSON.stringify(typedControllerProfile.eventBuses) === JSON.stringify([0, 1]),
    "installed plugin probe normalizes typed VST3 MIDI controller metadata"
  );

  const typedProgramProfile = summarizeProbeMidiProgramChangeEvents([
    { type: "programChange", program: "7", channel: "2", busIndex: "1" },
    { type: "programChange", program: true, channel: "", busIndex: false }
  ]);
  check(
    typedProgramProfile.eventCount === 2 &&
      typedProgramProfile.invalidProgramNumberCount === 1 &&
      typedProgramProfile.invalidProgramRouteCount === 1 &&
      JSON.stringify(typedProgramProfile.programs) === JSON.stringify([7]) &&
      JSON.stringify(typedProgramProfile.channels) === JSON.stringify([2]) &&
      JSON.stringify(typedProgramProfile.eventBuses) === JSON.stringify([1]),
    "installed plugin probe normalizes typed VST3 program-change metadata"
  );

  const statusOnlySummary = summarizeProbeResults([
    {
      ok: true,
      format: "vst3",
      midiEventCount: 2,
      midiTimingProfile: summarizeProbeMidiTiming([
        { type: "noteOn", time: 0 },
        { type: "noteOff", time: 63 }
      ], 64)
    },
    {
      ok: true,
      format: "vst3",
      vst3MidiControllerEvents: "failed"
    },
    {
      ok: true,
      format: "au",
      midiEventCount: 2
    }
  ]);
  check(
    statusOnlySummary.matrix[0].midiTiming === "block-boundary" &&
      statusOnlySummary.matrix[0].featureStatus.midiEvents === "passed" &&
      statusOnlySummary.matrix[1].vst3MidiControllerEvents === "failed" &&
      statusOnlySummary.matrix[1].featureStatus.midiEvents === "failed" &&
      statusOnlySummary.matrix[2].featureStatus.midiEvents === "passed",
    "installed plugin probe reports status-only MIDI event results"
  );
}
