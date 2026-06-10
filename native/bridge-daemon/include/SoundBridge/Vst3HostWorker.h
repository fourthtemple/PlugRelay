#pragma once

#include <string>

namespace soundbridge {

bool vst3HostWorkerAvailable();
std::string vst3HostWorkerStatus();
int runVst3HostWorker(int argc, char** argv);

} // namespace soundbridge
