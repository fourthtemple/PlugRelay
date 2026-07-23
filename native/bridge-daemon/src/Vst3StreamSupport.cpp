#include "PlugRelay/Vst3StreamSupport.h"

#ifdef PLUGRELAY_ENABLE_VST3_SDK

#include "PlugRelay/Base64.h"

#include <cstdint>
#include <stdexcept>

namespace plugrelay::vst3_worker {

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

} // namespace plugrelay::vst3_worker

#endif
