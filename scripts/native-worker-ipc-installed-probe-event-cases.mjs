import { summarizeProbeVst3Events } from "./installed-plugin-probe-events.mjs";
import { summarizeProbeResults } from "./installed-plugin-probe-reporting.mjs";

export function exerciseInstalledProbeEventSupport({ check }) {
  const profile = summarizeProbeVst3Events({
    format: "vst3",
    vst3NoteExpressions: [
      {
        typeId: 0,
        name: "Velocity",
        minValue: 0.5,
        maxValue: 0.5,
        defaultValue: 0.5,
        stepCount: 4,
        bipolar: true
      },
      {
        typeId: 6,
        name: "",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0.25,
        oneShot: true,
        absolute: true
      },
      {
        typeId: 7,
        minValue: 0.8,
        maxValue: 0.2,
        defaultValue: 0.9
      }
    ]
  });
  const summary = summarizeProbeResults([{ ok: true, format: "vst3", vst3EventProfile: profile }]);
  const matrix = summary.matrix[0];
  check(
    profile.noteExpressionCount === 3 &&
      profile.valueExpressionCount === 2 &&
      profile.textExpressionCount === 1 &&
      profile.fixedValueRangeCount === 1 &&
      profile.steppedExpressionCount === 1 &&
      profile.nameFallbackExpressionCount === 1 &&
      profile.invalidNoteExpressionValueMetadataCount === 1 &&
      profile.flags.includes("text-expression") &&
      profile.flags.includes("value-expression") &&
      profile.flags.includes("invalid-value-metadata") &&
      summary.coverage.vst3EventProfiles["flag:fixed-value-range"] === 1 &&
      summary.coverage.vst3EventProfiles["flag:stepped-expression"] === 1 &&
      matrix.vst3FixedNoteExpressionValueRangeCount === 1 &&
      matrix.vst3SteppedNoteExpressionCount === 1 &&
      matrix.vst3NameFallbackNoteExpressionCount === 1 &&
      matrix.vst3InvalidNoteExpressionValueMetadataCount === 1,
    "installed plugin probe reports VST3 note-expression text/value metadata"
  );
}
