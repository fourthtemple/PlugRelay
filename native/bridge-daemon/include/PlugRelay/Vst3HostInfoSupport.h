#pragma once

#ifdef PLUGRELAY_ENABLE_VST3_SDK

#include "pluginterfaces/vst/ivstaudioprocessor.h"

#include <string>

namespace plugrelay::vst3_worker {

std::string vst3LatencyToJson(Steinberg::Vst::IAudioProcessor* processor);
std::string vst3TailTimeToJson(Steinberg::Vst::IAudioProcessor* processor);

} // namespace plugrelay::vst3_worker

#endif
