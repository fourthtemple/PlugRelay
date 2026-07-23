#pragma once

#include "PlugRelay/Lv2Abi.h"

#include <cstddef>
#include <cstdint>
#include <vector>

namespace plugrelay::lv2_worker {

class Lv2WorkerCycle {
public:
  void setInterface(const lv2_abi::LV2_Worker_Interface* workerInterface);
  void setHandle(lv2_abi::LV2_Handle handle);
  bool available() const;
  lv2_abi::LV2_Worker_Schedule scheduleFeature();
  void reset();
  void deliverResponses();

private:
  static lv2_abi::LV2_Worker_Status scheduleLv2Work(
      lv2_abi::LV2_Worker_Schedule_Handle handle,
      std::uint32_t size,
      const void* data);
  static lv2_abi::LV2_Worker_Status respondLv2Work(
      lv2_abi::LV2_Worker_Respond_Handle handle,
      std::uint32_t size,
      const void* data);

  lv2_abi::LV2_Worker_Status scheduleWork(std::uint32_t size, const void* data) noexcept;
  lv2_abi::LV2_Worker_Status queueResponse(std::uint32_t size, const void* data) noexcept;

  const lv2_abi::LV2_Worker_Interface* workerInterface_ = nullptr;
  lv2_abi::LV2_Handle handle_ = nullptr;
  std::vector<std::vector<std::uint8_t>> pendingResponses_;
  std::size_t scheduledMessages_ = 0;
  std::size_t workBytes_ = 0;
  std::size_t responseBytes_ = 0;
};

} // namespace plugrelay::lv2_worker
