#pragma once

#include "SoundBridge/NativePlugin.h"

#include <filesystem>
#include <vector>

namespace soundbridge {

class AudioUnitScanner {
public:
  AudioUnitScanner();

  std::vector<std::filesystem::path> searchPaths() const;
  std::vector<NativePluginInfo> scan() const;

private:
  std::vector<std::filesystem::path> paths_;
};

} // namespace soundbridge
