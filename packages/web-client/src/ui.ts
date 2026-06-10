import type { PluginParameter } from "../../protocol/src/messages";
import { SoundBridgeClient } from "./client";

export interface ParameterUiOptions {
  container: HTMLElement;
  client: SoundBridgeClient;
  instanceId: string;
  parameters: PluginParameter[];
}

export function renderParameterControls(options: ParameterUiOptions): void {
  const { container, client, instanceId, parameters } = options;
  container.replaceChildren();

  for (const parameter of parameters) {
    const row = document.createElement("label");
    row.className = "parameter-row";
    row.dataset.parameterId = parameter.id;

    const name = document.createElement("span");
    name.className = "parameter-name";
    name.textContent = parameter.name;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.001";
    slider.value = String(parameter.normalizedValue);
    slider.disabled = !parameter.automatable;

    const value = document.createElement("output");
    value.className = "parameter-value";
    value.value = formatParameterValue(parameter);

    slider.addEventListener("input", () => {
      const normalizedValue = Number(slider.value);
      value.value = formatParameterValue({ ...parameter, normalizedValue });
      void client.setParameter(instanceId, parameter.id, normalizedValue).then(({ parameter: updated }) => {
        value.value = formatParameterValue(updated);
      });
    });

    row.append(name, slider, value);
    container.append(row);
  }
}

function formatParameterValue(parameter: PluginParameter): string {
  const min = parameter.minPlain ?? 0;
  const max = parameter.maxPlain ?? 1;
  const plain = parameter.plainValue ?? min + (max - min) * parameter.normalizedValue;
  const suffix = parameter.unit ? ` ${parameter.unit}` : "";
  return `${plain.toFixed(2)}${suffix}`;
}
