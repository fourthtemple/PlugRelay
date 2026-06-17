import { summarizeParameterProfile } from "./installed-plugin-probe-parameters.mjs";
import { summarizeProbeResults } from "./installed-plugin-probe-reporting.mjs";

export function exerciseInstalledProbeParameterSupport({ check }) {
  const parameterProfile = summarizeParameterProfile([
    {
      id: "program-with-list",
      programChange: true,
      programList: {
        id: 1,
        programs: [{ index: 0, name: "Program 1" }]
      },
      vst3Unit: { id: 2, programListId: 1 }
    },
    {
      id: "program-without-list",
      programChange: true,
      vst3Unit: { id: 3, programListId: -1 }
    },
    {
      id: "read-only",
      automatable: false,
      readOnly: true
    }
  ], { format: "vst3" });
  const matrix = summarizeProbeResults([
    {
      ok: true,
      format: "vst3",
      parameterProfile
    }
  ]).matrix[0];

  check(
    parameterProfile.category === "writable" &&
      parameterProfile.programChangeCount === 2 &&
      parameterProfile.programChangeWithoutListCount === 1 &&
      parameterProfile.vst3UnitCount === 2 &&
      parameterProfile.vst3UnitProgramListLinkCount === 1 &&
      parameterProfile.invalidVst3UnitProgramListLinkCount === 1 &&
      parameterProfile.flags.includes("program-change") &&
      parameterProfile.flags.includes("program-change-without-list") &&
      parameterProfile.flags.includes("vst3-unit-program-list-link") &&
      parameterProfile.flags.includes("invalid-vst3-unit-program-list-link") &&
      matrix.parameterProgramChangeCount === 2 &&
      matrix.parameterProgramChangeWithoutListCount === 1 &&
      matrix.parameterVst3UnitProgramListLinkCount === 1 &&
      matrix.parameterInvalidVst3UnitProgramListLinkCount === 1 &&
      matrix.parameterFlags.includes("program-change-without-list"),
    "installed plugin probe reports program-change parameters without listed programs"
  );
}
