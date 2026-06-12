#pragma once

#ifdef SOUNDBRIDGE_MACOS

#include "SoundBridge/AudioUnitHostWorkerSupport.h"
#include "SoundBridge/NativeFileGrantSupport.h"

#include <AudioToolbox/AudioToolbox.h>

#include <cstdint>
#include <string>
#include <vector>

namespace soundbridge::audio_unit_worker {

class HostedAudioUnit {
public:
  HostedAudioUnit(
      std::string componentType,
      std::string componentSubType,
      std::string componentManufacturer,
      double sampleRate,
      std::uint32_t maxBlockSize,
      std::uint32_t inputChannels,
      std::uint32_t outputChannels);
  HostedAudioUnit(const HostedAudioUnit&) = delete;
  HostedAudioUnit& operator=(const HostedAudioUnit&) = delete;
  ~HostedAudioUnit();

  bool sendMidi(UInt32 status, UInt32 data1, UInt32 data2, std::uint32_t sampleOffset);
  void sendMidiEvents(const std::vector<PendingMidiMessage>& messages);
  void noteOn(std::uint8_t note, double velocity, std::uint8_t channel = 0, std::uint32_t sampleOffset = 0);
  void noteOff(std::uint8_t note, std::uint8_t channel = 0, std::uint32_t sampleOffset = 0);
  std::string parametersToJson() const;
  std::string setParameter(AudioUnitParameterID parameterId, double normalizedValue, std::uint32_t sampleOffset);
  std::string setParameterDisplayValue(AudioUnitParameterID parameterId, const std::string& displayValue);
  std::string stateToJson() const;
  void writeStateFile(const worker_file_grants::NativeFileGrantCommand& command) const;
  std::string setState(const std::string& stateText);
  std::string latencyToJson() const;
  std::string tailTimeToJson() const;
  std::string layoutToJson() const;
  RenderedAudio render(
      std::uint32_t frames,
      double sampleRate,
      std::vector<std::vector<float>> inputChannels,
      std::vector<IndexedAudioBus> inputBuses,
      HostTransportContext transport);
  double sampleTime() const;

private:
  std::uint32_t activeInputBusCount() const;
  std::uint32_t activeOutputBusCount() const;
  std::string inputBusLayoutsToJson() const;
  std::string outputBusLayoutsToJson() const;
  std::string stateBase64() const;
  std::vector<std::string> parameterJsonList() const;
  static OSStatus inputCallback(
      void* refCon,
      AudioUnitRenderActionFlags* actionFlags,
      const AudioTimeStamp* timeStamp,
      UInt32 busNumber,
      UInt32 frameCount,
      AudioBufferList* ioData);
  static OSStatus beatAndTempoCallback(void* userData, Float64* currentBeat, Float64* currentTempo);
  static OSStatus musicalTimeLocationCallback(
      void* userData,
      UInt32* deltaSampleOffsetToNextBeat,
      Float32* timeSigNumerator,
      UInt32* timeSigDenominator,
      Float64* currentMeasureDownBeat);
  static OSStatus transportStateCallback(
      void* userData,
      Boolean* isPlaying,
      Boolean* transportStateChanged,
      Float64* currentSampleInTimeLine,
      Boolean* isCycling,
      Float64* cycleStartBeat,
      Float64* cycleEndBeat);
  static OSStatus transportState2Callback(
      void* userData,
      Boolean* isPlaying,
      Boolean* isRecording,
      Boolean* transportStateChanged,
      Float64* currentSampleInTimeLine,
      Boolean* isCycling,
      Float64* cycleStartBeat,
      Float64* cycleEndBeat);
  static OSStatus fillTransportState(
      void* userData,
      Boolean* isPlaying,
      Boolean* isRecording,
      Boolean* transportStateChanged,
      Float64* currentSampleInTimeLine,
      Boolean* isCycling,
      Float64* cycleStartBeat,
      Float64* cycleEndBeat);
  UInt32 samplesUntilNextBeat(const HostTransportContext& transport) const;
  void installHostCallbacks();
  std::uint32_t audioUnitElementCount(AudioUnitScope scope, std::uint32_t fallback) const;
  void configure();

  AudioUnit unit_ = nullptr;
  double sampleRate_ = 48000.0;
  std::uint32_t maxBlockSize_ = 128;
  std::uint32_t requestedInputChannels_ = 2;
  std::uint32_t requestedOutputChannels_ = 2;
  std::uint32_t inputChannels_ = 2;
  std::uint32_t outputChannels_ = 2;
  std::uint32_t inputBusCount_ = 0;
  std::uint32_t outputBusCount_ = 0;
  std::vector<bool> inputBusActive_;
  std::vector<bool> outputBusActive_;
  std::vector<IndexedAudioBus> currentInputBuses_;
  std::uint32_t currentInputFrames_ = 0;
  HostTransportContext currentTransport_;
  double sampleTime_ = 0.0;
  bool currentTransportInitialized_ = false;
  bool transportStateChanged_ = false;
};

} // namespace soundbridge::audio_unit_worker

#endif
