#pragma once

#include <string>

namespace plugrelay {

bool vst3HostWorkerAvailable();
std::string vst3HostWorkerStatus();
int runVst3HostWorker(int argc, char** argv);

} // namespace plugrelay
