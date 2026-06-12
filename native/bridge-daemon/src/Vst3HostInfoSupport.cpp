#include "SoundBridge/Vst3HostInfoSupport.h"

#ifdef SOUNDBRIDGE_ENABLE_VST3_SDK

#include "SoundBridge/Vst3HostWorkerSupport.h"

#include <algorithm>
#include <cstdint>
#include <sstream>
#include <stdexcept>

namespace soundbridge::vst3_worker {

std::string vst3LatencyToJson(Steinberg::Vst::IAudioProcessor* processor) {
  if (processor == nullptr) {
    throw std::runtime_error("missing_vst3_processor");
  }

  const auto samples = std::min<std::uint32_t>(
      processor->getLatencySamples(),
      kMaxWorkerLatencySamples);
  std::ostringstream output;
  output << "{\"latencySamples\":" << samples << "}";
  return output.str();
}

std::string vst3TailTimeToJson(Steinberg::Vst::IAudioProcessor* processor) {
  if (processor == nullptr) {
    throw std::runtime_error("missing_vst3_processor");
  }

  const auto rawSamples = processor->getTailSamples();
  const auto infiniteTail = rawSamples == Steinberg::Vst::kInfiniteTail;
  const auto samples = infiniteTail
      ? kMaxWorkerTailSamples
      : std::min<std::uint32_t>(rawSamples, kMaxWorkerTailSamples);
  std::ostringstream output;
  output << "{\"tailSamples\":" << samples
         << ",\"infiniteTail\":" << (infiniteTail ? "true" : "false")
         << "}";
  return output.str();
}

} // namespace soundbridge::vst3_worker

#endif
