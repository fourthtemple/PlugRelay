#pragma once

#include "PlugRelay/NativePlugin.h"

#include <filesystem>
#include <vector>

namespace plugrelay {

class Vst3Scanner {
public:
  Vst3Scanner();

  std::vector<std::filesystem::path> searchPaths() const;
  std::vector<NativePluginInfo> scan() const;

private:
  std::vector<std::filesystem::path> paths_;
};

std::string vst3BundleListToJson(const std::vector<NativePluginInfo>& plugins);
std::string vst3FactoryMetadataToJson(const std::filesystem::path& bundlePath);

} // namespace plugrelay
