#include "SoundBridge/Vst3StreamSupport.h"

#ifdef SOUNDBRIDGE_ENABLE_VST3_SDK

#include "SoundBridge/Base64.h"

#include <cstdint>
#include <stdexcept>

namespace soundbridge::vst3_worker {

std::string memoryStreamToBase64(
    Steinberg::MemoryStream& stream,
    std::size_t maxBytes,
    const std::string& sizeError) {
  const auto size = stream.getSize();
  if (size <= 0) {
    return "";
  }
  if (static_cast<std::size_t>(size) > maxBytes) {
    throw std::runtime_error(sizeError);
  }
  const auto* data = reinterpret_cast<const std::uint8_t*>(stream.getData());
  return base64Encode(data, static_cast<std::size_t>(size));
}

} // namespace soundbridge::vst3_worker

#endif
