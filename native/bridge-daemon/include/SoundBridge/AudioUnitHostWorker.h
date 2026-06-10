#pragma once

#include <string>

namespace soundbridge {

bool audioUnitHostAvailable();
std::string audioUnitHostStatus();
int runAudioUnitHostWorker(int argc, char** argv);

} // namespace soundbridge
