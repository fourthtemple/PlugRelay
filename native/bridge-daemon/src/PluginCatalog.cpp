#include "PlugRelay/PluginCatalog.h"

#include "PlugRelay/AudioUnitScanner.h"
#include "PlugRelay/Lv2Scanner.h"
#include "PlugRelay/Vst3Scanner.h"

#include <iterator>

namespace plugrelay {

std::vector<NativePluginInfo> PluginCatalog::scanAll(bool includeExamples) const {
  std::vector<NativePluginInfo> plugins;
  for (const auto format : {PluginFormat::Vst3, PluginFormat::AudioUnit, PluginFormat::Lv2}) {
    auto formatPlugins = scanFormat(format);
    for (auto& plugin : formatPlugins) {
      if (includeExamples || !plugin.isExample) {
        plugins.push_back(std::move(plugin));
      }
    }
  }
  return plugins;
}

std::vector<NativePluginInfo> PluginCatalog::scanExamples() const {
  std::vector<NativePluginInfo> plugins;
  for (const auto format : {PluginFormat::Vst3, PluginFormat::AudioUnit, PluginFormat::Lv2}) {
    auto formatPlugins = scanFormat(format);
    for (auto& plugin : formatPlugins) {
      if (plugin.isExample) {
        plugins.push_back(std::move(plugin));
      }
    }
  }
  return plugins;
}

std::vector<NativePluginInfo> PluginCatalog::scanFormat(PluginFormat format) const {
  switch (format) {
    case PluginFormat::Vst3:
      return Vst3Scanner().scan();
    case PluginFormat::AudioUnit:
      return AudioUnitScanner().scan();
    case PluginFormat::Lv2:
      return Lv2Scanner().scan();
    case PluginFormat::Mock:
    case PluginFormat::Unknown:
      return {};
  }
  return {};
}

} // namespace plugrelay
