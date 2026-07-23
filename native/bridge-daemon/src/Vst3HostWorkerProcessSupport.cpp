#include "PlugRelay/Vst3HostWorkerProcessSupport.h"

#ifdef PLUGRELAY_ENABLE_VST3_SDK

#include "PlugRelay/Vst3HostWorkerSupport.h"

namespace plugrelay::vst3_worker {

Steinberg::Vst::ProcessContext processContextForTransport(
    const HostTransportContext& transport,
    double sampleRate) {
  Steinberg::Vst::ProcessContext processContext {};
  processContext.sampleRate = sampleRate;
  processContext.projectTimeSamples = transport.samplePosition;
  processContext.continousTimeSamples = transport.samplePosition;
  processContext.state = Steinberg::Vst::ProcessContext::kContTimeValid;
  if (transport.playing) {
    processContext.state |= Steinberg::Vst::ProcessContext::kPlaying;
  }
  if (transport.recording) {
    processContext.state |= Steinberg::Vst::ProcessContext::kRecording;
  }
  if (transport.loopActive) {
    processContext.state |= Steinberg::Vst::ProcessContext::kCycleActive;
  }
  if (transport.hasTempo) {
    processContext.tempo = transport.tempo;
    processContext.state |= Steinberg::Vst::ProcessContext::kTempoValid;
  }
  if (transport.hasTimeSignature) {
    processContext.timeSigNumerator = transport.timeSignatureNumerator;
    processContext.timeSigDenominator = transport.timeSignatureDenominator;
    processContext.state |= Steinberg::Vst::ProcessContext::kTimeSigValid;
  }
  if (transport.hasProjectTimeMusic) {
    processContext.projectTimeMusic = transport.projectTimeMusic;
    processContext.state |= Steinberg::Vst::ProcessContext::kProjectTimeMusicValid;
  }
  if (transport.hasBarPositionMusic) {
    processContext.barPositionMusic = transport.barPositionMusic;
    processContext.state |= Steinberg::Vst::ProcessContext::kBarPositionValid;
  }
  if (transport.hasCycle) {
    processContext.cycleStartMusic = transport.cycleStartMusic;
    processContext.cycleEndMusic = transport.cycleEndMusic;
    processContext.state |= Steinberg::Vst::ProcessContext::kCycleValid;
  }
  return processContext;
}

} // namespace plugrelay::vst3_worker

#endif
