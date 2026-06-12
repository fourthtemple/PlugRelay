#pragma once

#ifdef SOUNDBRIDGE_ENABLE_VST3_SDK

#include "pluginterfaces/vst/ivstprocesscontext.h"

namespace soundbridge::vst3_worker {

struct HostTransportContext;

Steinberg::Vst::ProcessContext processContextForTransport(
    const HostTransportContext& transport,
    double sampleRate);

} // namespace soundbridge::vst3_worker

#endif
