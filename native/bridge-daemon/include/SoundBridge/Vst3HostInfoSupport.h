#pragma once

#ifdef SOUNDBRIDGE_ENABLE_VST3_SDK

#include "pluginterfaces/vst/ivstaudioprocessor.h"

#include <string>

namespace soundbridge::vst3_worker {

std::string vst3LatencyToJson(Steinberg::Vst::IAudioProcessor* processor);
std::string vst3TailTimeToJson(Steinberg::Vst::IAudioProcessor* processor);

} // namespace soundbridge::vst3_worker

#endif
