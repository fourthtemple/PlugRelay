import type { PluginParameter } from "../../protocol/src/messages";
import { PlugRelayClient } from "./client";

export interface ParameterUiOptions {
  container: HTMLElement;
  client: PlugRelayClient;
  instanceId: string;
  parameters: PluginParameter[];
}

const PARAMETER_CATEGORY_PATTERNS: Array<[string, RegExp]> = [
  ["wave", /\b(wave\s*shaper|waveshaper|wave\s*fold|wavefold|fold|shape|shaper)\b/u],
  ["drive", /\b(drive|distortion|saturat|clip|crush|fuzz|overdrive)\b/u],
  ["gain", /\b(gain|volume|level|trim|input|output|makeup)\b/u],
  ["filter", /\b(cutoff|freq|frequency|filter|tone|brightness|color)\b/u],
  ["resonance", /\b(resonance|reso|res|q|emphasis|bandwidth)\b/u],
  ["envelope", /\b(attack|decay|sustain|release|adsr|envelope|env|hold)\b/u],
  ["mix", /\b(mix|blend|wet|dry)\b/u],
  ["pan", /\b(pan|balance|width|spread|stereo)\b/u],
  ["pitch", /\b(pitch|tune|detune|octave|semitone|transpose|cent)\b/u],
  ["modulation", /\b(lfo|mod|modulation|rate|depth|vibrato|tremolo)\b/u],
  ["space", /\b(reverb|delay|echo|room|size|feedback|damping)\b/u],
  ["midi", /\b(midi|cc|controller|note|velocity|aftertouch|expression)\b/u],
  ["timing", /\b(sync|tempo|time|bpm|swing)\b/u],
  ["program", /\b(program|preset|patch|bank)\b/u]
];

export function renderParameterControls(options: ParameterUiOptions): void {
  const { container, client, instanceId, parameters } = options;
  container.replaceChildren();

  for (const parameter of parameters) {
    const row = document.createElement("label");
    row.className = "parameter-row";
    row.dataset.parameterCategory = parameterCategory(parameter);
    row.dataset.parameterId = parameter.id;

    const name = document.createElement("span");
    name.className = "parameter-name";
    name.textContent = parameter.name;

    const value = document.createElement("output");
    value.className = "parameter-value";
    value.value = formatParameterValue(parameter);

    const programs = parameter.programList?.programs ?? [];
    const control = programs.length > 0 ? document.createElement("select") : document.createElement("input");
    const disabled = parameter.readOnly === true || !parameter.automatable;
    if (control instanceof HTMLSelectElement) {
      for (const program of programs) {
        const option = document.createElement("option");
        option.value = String(program.normalizedValue);
        option.textContent = program.name;
        option.selected = Math.abs(program.normalizedValue - parameter.normalizedValue) < 0.000001;
        control.append(option);
      }
      control.disabled = disabled;
      control.addEventListener("change", () => {
        const normalizedValue = Number(control.value);
        const selectedProgram = programs.find((program) => Math.abs(program.normalizedValue - normalizedValue) < 0.000001);
        value.value = selectedProgram?.name ?? formatParameterValue({ ...parameter, normalizedValue, displayValue: undefined });
        void client.setParameter(instanceId, parameter.id, normalizedValue).then(({ parameter: updated }) => {
          value.value = formatParameterValue(updated);
        });
      });
    } else {
      control.type = "range";
      control.min = "0";
      control.max = "1";
      control.step = "0.001";
      control.value = String(parameter.normalizedValue);
      control.disabled = disabled;
      control.addEventListener("input", () => {
        const normalizedValue = Number(control.value);
        value.value = formatParameterValue({ ...parameter, normalizedValue, displayValue: undefined });
        void client.setParameter(instanceId, parameter.id, normalizedValue).then(({ parameter: updated }) => {
          value.value = formatParameterValue(updated);
        });
      });
    }

    row.append(name, control, value);
    container.append(row);
  }
}

function parameterCategory(parameter: PluginParameter): string {
  if (parameter.programChange || parameter.programList) {
    return "program";
  }
  const label = `${parameter.id} ${parameter.name} ${parameter.unit ?? ""}`.toLowerCase();
  for (const [category, pattern] of PARAMETER_CATEGORY_PATTERNS) {
    if (pattern.test(label)) {
      return category;
    }
  }
  return parameter.readOnly ? "status" : "utility";
}

function formatParameterValue(parameter: PluginParameter): string {
  if (parameter.displayValue) {
    return parameter.displayValue;
  }
  const programs = parameter.programList?.programs ?? [];
  const selectedProgram = programs.find((program) => Math.abs(program.normalizedValue - parameter.normalizedValue) < 0.000001);
  if (selectedProgram) {
    return selectedProgram.name;
  }
  const min = parameter.minPlain ?? 0;
  const max = parameter.maxPlain ?? 1;
  const plain = parameter.plainValue ?? min + (max - min) * parameter.normalizedValue;
  const suffix = parameter.unit ? ` ${parameter.unit}` : "";
  return `${plain.toFixed(2)}${suffix}`;
}
