#pragma once

#include <string>

namespace plugrelay {

bool lv2HostWorkerAvailable();
std::string lv2HostWorkerStatus();
int runLv2HostWorker(int argc, char** argv);

} // namespace plugrelay
