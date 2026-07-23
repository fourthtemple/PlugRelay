#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace plugrelay {

struct ExampleVoice {
  std::uint8_t note = 60;
  double velocity = 0.8;
};

struct ExampleRenderConfig {
  std::string pluginId;
  std::uint32_t frames = 128;
  double sampleRate = 48000.0;
  double gain = 0.5;
  double tone = 0.5;
  double detune = 0.5;
  std::vector<ExampleVoice> voices;
};

class ExampleInstrumentState {
public:
  explicit ExampleInstrumentState(std::string pluginId);

  void noteOn(std::uint8_t note, double velocity);
  void noteOff(std::uint8_t note);
  std::vector<std::vector<float>> render(
      std::uint32_t frames,
      double sampleRate,
      double gain,
      double tone,
      double detune);

private:
  struct VoiceState {
    std::uint8_t note = 60;
    double velocity = 0.8;
    double phase = 0.0;
    double phase2 = 0.0;
  };

  std::string pluginId_;
  std::vector<VoiceState> voices_;
};

bool isExampleInstrumentPluginId(const std::string& pluginId);
std::vector<std::vector<float>> renderExampleInstrumentBlock(const ExampleRenderConfig& config);
std::string exampleInstrumentBlockToJson(const std::vector<std::vector<float>>& channels);
std::vector<ExampleVoice> parseExampleVoices(const std::string& voices);

} // namespace plugrelay
