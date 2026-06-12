#include "SoundBridge/Vst3StateSupport.h"

#ifdef SOUNDBRIDGE_ENABLE_VST3_SDK

#include "SoundBridge/Base64.h"
#include "SoundBridge/NativeFileGrantSupport.h"
#include "SoundBridge/Vst3HostWorkerSupport.h"
#include "SoundBridge/Vst3StreamSupport.h"

#include "pluginterfaces/base/ibstream.h"

#include <cstdint>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace soundbridge::vst3_worker {
namespace {

std::string componentStateBase64(Steinberg::Vst::IComponent* component) {
  if (component == nullptr) {
    throw std::runtime_error("missing_vst3_component");
  }

  Steinberg::MemoryStream stream;
  if (component->getState(&stream) != Steinberg::kResultOk) {
    return "";
  }
  return memoryStreamToBase64(stream, kMaxWorkerStateBytes, "component_state_too_large");
}

std::string controllerStateBase64(Steinberg::Vst::IEditController* controller) {
  if (controller == nullptr) {
    return "";
  }

  Steinberg::MemoryStream stream;
  if (controller->getState(&stream) != Steinberg::kResultOk) {
    return "";
  }
  return memoryStreamToBase64(stream, kMaxWorkerStateBytes, "controller_state_too_large");
}

} // namespace

std::string vst3StateToJson(
    Steinberg::Vst::IComponent* component,
    Steinberg::Vst::IEditController* controller) {
  std::ostringstream output;
  output << "{\"state\":{"
         << "\"component\":\"" << componentStateBase64(component) << "\""
         << ",\"controller\":\"" << controllerStateBase64(controller) << "\""
         << "}}";
  return output.str();
}

void writeVst3StateFile(
    const worker_file_grants::NativeFileGrantCommand& command,
    Steinberg::Vst::IComponent* component,
    Steinberg::Vst::IEditController* controller) {
  worker_file_grants::writeDualStateFile(
      command,
      componentStateBase64(component),
      controllerStateBase64(controller),
      kMaxWorkerStateBytes);
}

std::string restoreVst3State(
    Steinberg::Vst::IComponent* component,
    Steinberg::Vst::IEditController* controller,
    const std::string& componentStateText,
    const std::string& controllerStateText) {
  if (component == nullptr) {
    throw std::runtime_error("missing_vst3_component");
  }

  if (componentStateText != "-") {
    auto componentState = base64Decode(componentStateText, kMaxWorkerStateBytes);
    Steinberg::MemoryStream componentStream(
        componentState.data(),
        static_cast<Steinberg::TSize>(componentState.size()));
    checkResult(component->setState(&componentStream), "IComponent::setState");

    if (controller != nullptr) {
      componentStream.seek(0, Steinberg::IBStream::kIBSeekSet, nullptr);
      controller->setComponentState(&componentStream);
    }
  }

  if (controller != nullptr && controllerStateText != "-") {
    auto controllerState = base64Decode(controllerStateText, kMaxWorkerStateBytes);
    Steinberg::MemoryStream controllerStream(
        controllerState.data(),
        static_cast<Steinberg::TSize>(controllerState.size()));
    checkResult(controller->setState(&controllerStream), "IEditController::setState");
  }

  return "{\"ok\":true}";
}

} // namespace soundbridge::vst3_worker

#endif
