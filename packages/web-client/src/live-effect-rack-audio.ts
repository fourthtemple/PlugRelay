import type { AudioBlockRequest } from "../../protocol/src/messages";
import type { BinaryAudioBusBlock } from "./client";

export function transitionOutputChannels(
  channels: ArrayLike<number>[],
  previousTail: number[] | undefined,
  previousPath: "wet" | "dry" | undefined,
  outputPath: "wet" | "dry",
  fadeSamples: number
): ArrayLike<number>[] {
  if (fadeSamples <= 0 || !previousTail || previousPath === undefined || previousPath === outputPath) {
    return channels;
  }
  return channels.map((source, channelIndex) => {
    const output = Array.from(source);
    const fade = Math.min(output.length, fadeSamples);
    const previous = previousTail[channelIndex % previousTail.length] ?? 0;
    for (let frame = 0; frame < fade; frame += 1) {
      const wet = (frame + 1) / (fade + 1);
      output[frame] = previous * (1 - wet) + output[frame] * wet;
    }
    return output;
  });
}

export function wetMixedChannels(
  wetChannels: ArrayLike<number>[],
  dryInput: ArrayLike<number>[] | undefined,
  outputChannels: number,
  wetMix: number
): ArrayLike<number>[] {
  if (wetMix >= 1) {
    return wetChannels;
  }
  const dry = dryChannels(dryInput ?? [], outputChannels);
  if (wetMix <= 0) {
    return dry;
  }
  return Array.from({ length: outputChannels }, (_, channelIndex) => {
    const wet = wetChannels.length > 0 ? wetChannels[channelIndex % wetChannels.length] : [];
    const dryChannel = dry[channelIndex];
    const frames = Math.max(wet.length, dryChannel.length);
    return Array.from(
      { length: frames },
      (_unused, frame) => Number(dryChannel[frame] ?? 0) * (1 - wetMix) + Number(wet[frame] ?? 0) * wetMix
    );
  });
}

export function outputTail(channels: ArrayLike<number>[], outputChannels: number): number[] {
  return Array.from({ length: outputChannels }, (_, index) => {
    const channel = channels.length > 0 ? channels[index % channels.length] : undefined;
    const sample = Number(channel?.[Math.max(0, channel.length - 1)] ?? 0);
    return Number.isFinite(sample) ? sample : 0;
  });
}

export function cloneChannels(channels: ArrayLike<number>[]): number[][] {
  return channels.map((channel) => Array.from(channel));
}

export function cloneBusBlocks(buses?: BinaryAudioBusBlock[]): AudioBlockRequest["inputBuses"] {
  return buses?.map((bus) => ({ index: bus.index, channels: cloneChannels(bus.channels) }));
}

export function dryChannels(channels: ArrayLike<number>[], outputChannels: number): number[][] {
  const frames = channels[0]?.length ?? 0;
  return Array.from({ length: outputChannels }, (_, index) => {
    const source = channels.length > 0 ? channels[index % channels.length] : undefined;
    return source ? Array.from(source) : Array.from({ length: frames }, () => 0);
  });
}
