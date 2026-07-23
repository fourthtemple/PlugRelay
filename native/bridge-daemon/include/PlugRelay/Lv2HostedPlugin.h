#pragma once

#ifndef _WIN32

#include "PlugRelay/Lv2Abi.h"
#include "PlugRelay/Lv2HostWorkerSupport.h"
#include "PlugRelay/NativeFileGrantSupport.h"

#include <memory>
#include <string>
#include <vector>

namespace plugrelay::lv2_worker {

class HostedLv2Plugin {
public:
  HostedLv2Plugin(
      std::string bundlePath,
      double sampleRate,
      std::uint32_t maxBlockSize,
      std::uint32_t inputChannels,
      std::uint32_t outputChannels);
  HostedLv2Plugin(const HostedLv2Plugin&) = delete;
  HostedLv2Plugin& operator=(const HostedLv2Plugin&) = delete;
  ~HostedLv2Plugin();

  std::vector<std::vector<float>> render(
      std::uint32_t frames,
      double sampleRate,
      std::vector<std::vector<float>> inputChannels,
      std::vector<IndexedAudioBus> inputBuses,
      HostTransportContext transport);
  double sampleTime() const;
  void enqueueMidiEvents(std::vector<PendingMidiMessage> messages);
  std::string parametersToJson() const;
  std::string setParameter(const std::string& parameterId, double value, std::uint32_t sampleOffset);
  std::string latencyToJson();
  std::string tailTimeToJson() const;
  std::string stateToJson();
  void writeStateFile(const worker_file_grants::NativeFileGrantCommand& command);
  std::string setState(const std::string& stateText);
  std::string layoutToJson() const;
  std::string outputAudioToJson(const std::vector<std::vector<float>>& channels) const;

private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace plugrelay::lv2_worker

#endif
