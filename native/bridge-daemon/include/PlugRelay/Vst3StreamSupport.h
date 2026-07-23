#pragma once

#ifdef PLUGRELAY_ENABLE_VST3_SDK

#include "public.sdk/source/common/memorystream.h"

#include <cstddef>
#include <string>

namespace plugrelay::vst3_worker {

std::string memoryStreamToBase64(
    Steinberg::MemoryStream& stream,
    std::size_t maxBytes,
    const std::string& sizeError);

} // namespace plugrelay::vst3_worker

#endif
