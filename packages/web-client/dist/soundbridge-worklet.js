class SoundBridgeAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const processorOptions = options.processorOptions ?? {};
    this.outputChannels = processorOptions.outputChannels ?? 2;
    this.maxQueuedOutputBlocks = processorOptions.maxQueuedOutputBlocks ?? 16;
    this.blockId = 0;
    this.underruns = 0;
    this.processedBlocks = 0;
    this.outputQueue = [];
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  process(inputs, outputs) {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    const frames = output[0]?.length ?? input[0]?.length ?? 128;
    const outgoing = this.copyInputBlock(input, frames);
    const queued = this.outputQueue.shift();

    if (queued) {
      this.writeBlock(output, queued, frames);
      this.processedBlocks += 1;
    } else {
      this.writeBlock(output, outgoing, frames);
      this.underruns += 1;
    }

    this.port.postMessage(
      {
        type: "process",
        blockId: this.blockId++,
        frames,
        channels: outgoing
      },
      outgoing.map((channel) => channel.buffer)
    );

    if (this.blockId % 128 === 0) {
      this.port.postMessage({
        type: "stats",
        processedBlocks: this.processedBlocks,
        underruns: this.underruns,
        queuedOutputBlocks: this.outputQueue.length
      });
    }

    return true;
  }

  handleMessage(message) {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "destroy") {
      this.outputQueue.length = 0;
      return;
    }

    if (message.type !== "processed" || !Array.isArray(message.channels)) {
      return;
    }

    if (this.outputQueue.length >= this.maxQueuedOutputBlocks) {
      this.outputQueue.shift();
    }

    this.outputQueue.push(
      message.channels.slice(0, this.outputChannels).map((channel) => Float32Array.from(channel))
    );
  }

  copyInputBlock(input, frames) {
    const channels = [];
    for (let channelIndex = 0; channelIndex < this.outputChannels; channelIndex += 1) {
      const source = input[channelIndex] ?? input[0];
      const copy = new Float32Array(frames);
      if (source) {
        copy.set(source.subarray(0, frames));
      }
      channels.push(copy);
    }
    return channels;
  }

  writeBlock(output, block, frames) {
    for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
      const destination = output[channelIndex];
      const source = block[channelIndex] ?? block[0];
      if (!destination) {
        continue;
      }
      if (source) {
        destination.set(source.subarray(0, frames));
      } else {
        destination.fill(0);
      }
    }
  }
}

registerProcessor("soundbridge-audio-processor", SoundBridgeAudioProcessor);
