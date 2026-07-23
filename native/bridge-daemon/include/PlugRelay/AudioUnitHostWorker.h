#pragma once

#include <string>

namespace plugrelay {

bool audioUnitHostAvailable();
std::string audioUnitHostStatus();
int runAudioUnitHostWorker(int argc, char** argv);

} // namespace plugrelay
