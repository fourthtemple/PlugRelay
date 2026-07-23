#pragma once

#ifdef PLUGRELAY_ENABLE_VST3_SDK

#include "pluginterfaces/vst/ivstprocesscontext.h"

namespace plugrelay::vst3_worker {

struct HostTransportContext;

Steinberg::Vst::ProcessContext processContextForTransport(
    const HostTransportContext& transport,
    double sampleRate);

} // namespace plugrelay::vst3_worker

#endif
