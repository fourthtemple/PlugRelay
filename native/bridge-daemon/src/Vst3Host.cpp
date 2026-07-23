#include "PlugRelay/Vst3Host.h"

namespace plugrelay {

bool Vst3Host::sdkAvailable() const {
#ifdef PLUGRELAY_ENABLE_VST3_SDK
  return true;
#else
  return false;
#endif
}

std::string Vst3Host::status() const {
  if (sdkAvailable()) {
    return "VST3 SDK integration enabled; audio processing is handled by the VST3 host worker.";
  }
  return "VST3 SDK integration not enabled; scanner-only VST3 support is active.";
}

std::vector<NativeParameterInfo> Vst3Host::parametersForInstance(const std::string& /* instanceId */) const {
  return {};
}

std::uint32_t Vst3Host::latencySamplesForInstance(const std::string& /* instanceId */) const {
  return 0;
}

} // namespace plugrelay
