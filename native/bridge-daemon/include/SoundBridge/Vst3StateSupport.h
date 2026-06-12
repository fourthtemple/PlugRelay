#pragma once

#ifdef SOUNDBRIDGE_ENABLE_VST3_SDK

#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"

#include <string>

namespace soundbridge::worker_file_grants {
struct NativeFileGrantCommand;
}

namespace soundbridge::vst3_worker {

std::string vst3StateToJson(
    Steinberg::Vst::IComponent* component,
    Steinberg::Vst::IEditController* controller);

void writeVst3StateFile(
    const worker_file_grants::NativeFileGrantCommand& command,
    Steinberg::Vst::IComponent* component,
    Steinberg::Vst::IEditController* controller);

std::string restoreVst3State(
    Steinberg::Vst::IComponent* component,
    Steinberg::Vst::IEditController* controller,
    const std::string& componentStateText,
    const std::string& controllerStateText);

} // namespace soundbridge::vst3_worker

#endif
