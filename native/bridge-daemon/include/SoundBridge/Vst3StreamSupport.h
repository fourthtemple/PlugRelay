#pragma once

#ifdef SOUNDBRIDGE_ENABLE_VST3_SDK

#include "public.sdk/source/common/memorystream.h"

#include <cstddef>
#include <string>

namespace soundbridge::vst3_worker {

std::string memoryStreamToBase64(
    Steinberg::MemoryStream& stream,
    std::size_t maxBytes,
    const std::string& sizeError);

} // namespace soundbridge::vst3_worker

#endif
