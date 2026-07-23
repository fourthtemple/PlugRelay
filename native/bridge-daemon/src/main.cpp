#include "PlugRelay/AudioUnitHostWorker.h"
#include "PlugRelay/AudioUnitScanner.h"
#include "PlugRelay/ExampleInstrumentRenderer.h"
#include "PlugRelay/Lv2HostWorker.h"
#include "PlugRelay/Lv2Scanner.h"
#include "PlugRelay/NativePlugin.h"
#include "PlugRelay/PluginCatalog.h"
#include "PlugRelay/Vst3HostWorker.h"
#include "PlugRelay/Vst3Scanner.h"

#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

namespace {

void printUsage() {
  std::cout << "plugrelay-daemon " << PLUGRELAY_VERSION << "\n";
  std::cout << "Usage:\n";
  std::cout << "  plugrelay-daemon --scan\n";
  std::cout << "  plugrelay-daemon --scan-installed\n";
  std::cout << "  plugrelay-daemon --scan-examples\n";
  std::cout << "  plugrelay-daemon --scan-vst3\n";
  std::cout << "  plugrelay-daemon --scan-au\n";
  std::cout << "  plugrelay-daemon --scan-lv2\n";
  std::cout << "  plugrelay-daemon --inspect-vst3-factory <bundle-path>\n";
  std::cout << "  plugrelay-daemon --host-status\n";
  std::cout << "  plugrelay-daemon --host-au-worker <type> <subtype> <manufacturer> <sample-rate> <max-block> <inputs> <outputs> <kind>\n";
  std::cout << "  plugrelay-daemon --host-lv2-worker <bundle-path> <sample-rate> <max-block> <inputs> <outputs> <kind>\n";
  std::cout << "  plugrelay-daemon --host-vst3-worker <bundle-path> <sample-rate> <max-block> <inputs> <outputs> <kind>\n";
  std::cout << "  plugrelay-daemon --render-example-block <plugin-id> <frames> <sample-rate> <gain> <tone> <detune> <note:velocity,...>\n";
}

std::string formatStatusToJson(
    plugrelay::PluginFormat format,
    bool scanAvailable,
    bool hostAvailable,
    bool exampleHostAvailable,
    const std::string& notes) {
  std::ostringstream output;
  output << "{";
  output << "\"format\":\"" << plugrelay::pluginFormatToString(format) << "\",";
  output << "\"scanAvailable\":" << (scanAvailable ? "true" : "false") << ",";
  output << "\"hostAvailable\":" << (hostAvailable ? "true" : "false") << ",";
  output << "\"exampleHostAvailable\":" << (exampleHostAvailable ? "true" : "false") << ",";
  output << "\"notes\":\"" << plugrelay::jsonEscape(notes) << "\"";
  output << "}";
  return output.str();
}

std::string hostStatusToJson() {
  std::ostringstream output;
  output << "{";
  output << "\"formats\":[";
  output << formatStatusToJson(
      plugrelay::PluginFormat::Vst3,
      true,
      plugrelay::vst3HostWorkerAvailable(),
      true,
      plugrelay::vst3HostWorkerStatus());
  output << ",";
  output << formatStatusToJson(
      plugrelay::PluginFormat::AudioUnit,
#ifdef PLUGRELAY_MACOS
      true,
#else
      false,
#endif
      plugrelay::audioUnitHostAvailable(),
      true,
      plugrelay::audioUnitHostStatus());
  output << ",";
  output << formatStatusToJson(
      plugrelay::PluginFormat::Lv2,
      true,
      plugrelay::lv2HostWorkerAvailable(),
      true,
      plugrelay::lv2HostWorkerStatus());
  output << "]";
  output << "}";
  return output.str();
}

} // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    printUsage();
    return 0;
  }

  const std::string command = argv[1];

  if (command == "--scan") {
    const plugrelay::PluginCatalog catalog;
    std::cout << plugrelay::nativePluginListToJson(catalog.scanAll()) << "\n";
    return 0;
  }

  if (command == "--scan-installed") {
    const plugrelay::PluginCatalog catalog;
    std::cout << plugrelay::nativePluginListToJson(catalog.scanAll(false)) << "\n";
    return 0;
  }

  if (command == "--scan-examples") {
    const plugrelay::PluginCatalog catalog;
    std::cout << plugrelay::nativePluginListToJson(catalog.scanExamples()) << "\n";
    return 0;
  }

  if (command == "--scan-vst3") {
    const plugrelay::Vst3Scanner scanner;
    std::cout << plugrelay::vst3BundleListToJson(scanner.scan()) << "\n";
    return 0;
  }

  if (command == "--scan-au") {
    const plugrelay::AudioUnitScanner scanner;
    std::cout << plugrelay::nativePluginListToJson(scanner.scan()) << "\n";
    return 0;
  }

  if (command == "--scan-lv2") {
    const plugrelay::Lv2Scanner scanner;
    std::cout << plugrelay::nativePluginListToJson(scanner.scan()) << "\n";
    return 0;
  }

  if (command == "--inspect-vst3-factory") {
    if (argc < 3) {
      std::cerr << "--inspect-vst3-factory requires a VST3 bundle path.\n";
      return 2;
    }
    std::cout << plugrelay::vst3FactoryMetadataToJson(argv[2]) << "\n";
    return 0;
  }

  if (command == "--host-status") {
    std::cout << hostStatusToJson() << "\n";
    return 0;
  }

  if (command == "--host-au-worker") {
    return plugrelay::runAudioUnitHostWorker(argc, argv);
  }

  if (command == "--host-lv2-worker") {
    return plugrelay::runLv2HostWorker(argc, argv);
  }

  if (command == "--host-vst3-worker") {
    return plugrelay::runVst3HostWorker(argc, argv);
  }

  if (command == "--render-example-block") {
    if (argc < 9) {
      std::cerr << "--render-example-block requires plugin id, frames, sample rate, gain, tone, detune, and voices.\n";
      return 2;
    }

    plugrelay::ExampleRenderConfig config;
    config.pluginId = argv[2];
    if (!plugrelay::isExampleInstrumentPluginId(config.pluginId)) {
      std::cerr << "Unknown example instrument plugin id: " << config.pluginId << "\n";
      return 3;
    }

    try {
      config.frames = static_cast<std::uint32_t>(std::stoul(argv[3]));
      config.sampleRate = std::stod(argv[4]);
      config.gain = std::stod(argv[5]);
      config.tone = std::stod(argv[6]);
      config.detune = std::stod(argv[7]);
    } catch (const std::exception& error) {
      std::cerr << "--render-example-block received invalid numeric arguments: " << error.what() << "\n";
      return 2;
    }
    config.voices = plugrelay::parseExampleVoices(argv[8]);

    std::cout << plugrelay::exampleInstrumentBlockToJson(
        plugrelay::renderExampleInstrumentBlock(config)) << "\n";
    return 0;
  }

  printUsage();
  return 1;
}
