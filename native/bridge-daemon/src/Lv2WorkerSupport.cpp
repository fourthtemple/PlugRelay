#include "PlugRelay/Lv2WorkerSupport.h"

#include "PlugRelay/Lv2HostWorkerSupport.h"

#include <stdexcept>
#include <utility>

namespace plugrelay::lv2_worker {

void Lv2WorkerCycle::setInterface(const lv2_abi::LV2_Worker_Interface* workerInterface) {
  workerInterface_ = workerInterface;
}

void Lv2WorkerCycle::setHandle(lv2_abi::LV2_Handle handle) {
  handle_ = handle;
}

bool Lv2WorkerCycle::available() const {
  return workerInterface_ != nullptr;
}

lv2_abi::LV2_Worker_Schedule Lv2WorkerCycle::scheduleFeature() {
  return lv2_abi::LV2_Worker_Schedule{this, &Lv2WorkerCycle::scheduleLv2Work};
}

void Lv2WorkerCycle::reset() {
  pendingResponses_.clear();
  scheduledMessages_ = 0;
  workBytes_ = 0;
  responseBytes_ = 0;
}

void Lv2WorkerCycle::deliverResponses() {
  if (workerInterface_ == nullptr) {
    return;
  }
  if (!pendingResponses_.empty() && workerInterface_->work_response == nullptr) {
    throw std::runtime_error("lv2_worker_response_unavailable");
  }
  for (const auto& response : pendingResponses_) {
    const auto status = workerInterface_->work_response(
        handle_,
        static_cast<std::uint32_t>(response.size()),
        response.empty() ? nullptr : response.data());
    if (status != kLv2WorkerSuccess) {
      throw std::runtime_error("lv2_worker_response_failed");
    }
  }
  pendingResponses_.clear();
  if (workerInterface_->end_run != nullptr) {
    const auto status = workerInterface_->end_run(handle_);
    if (status != kLv2WorkerSuccess) {
      throw std::runtime_error("lv2_worker_end_run_failed");
    }
  }
}

lv2_abi::LV2_Worker_Status Lv2WorkerCycle::scheduleLv2Work(
    lv2_abi::LV2_Worker_Schedule_Handle handle,
    std::uint32_t size,
    const void* data) {
  if (handle == nullptr) {
    return kLv2WorkerErrUnknown;
  }
  return static_cast<Lv2WorkerCycle*>(handle)->scheduleWork(size, data);
}

lv2_abi::LV2_Worker_Status Lv2WorkerCycle::respondLv2Work(
    lv2_abi::LV2_Worker_Respond_Handle handle,
    std::uint32_t size,
    const void* data) {
  if (handle == nullptr) {
    return kLv2WorkerErrUnknown;
  }
  return static_cast<Lv2WorkerCycle*>(handle)->queueResponse(size, data);
}

lv2_abi::LV2_Worker_Status Lv2WorkerCycle::scheduleWork(std::uint32_t size, const void* data) noexcept {
  try {
    if (workerInterface_ == nullptr || workerInterface_->work == nullptr || handle_ == nullptr) {
      return kLv2WorkerErrUnknown;
    }
    if ((size > 0 && data == nullptr) ||
        size > kMaxWorkerWorkMessageBytes ||
        scheduledMessages_ >= kMaxWorkerWorkMessages ||
        workBytes_ + size > kMaxWorkerWorkTotalBytes) {
      return kLv2WorkerErrNoSpace;
    }
    ++scheduledMessages_;
    workBytes_ += size;
    return workerInterface_->work(handle_, &Lv2WorkerCycle::respondLv2Work, this, size, data);
  } catch (...) {
    return kLv2WorkerErrUnknown;
  }
}

lv2_abi::LV2_Worker_Status Lv2WorkerCycle::queueResponse(std::uint32_t size, const void* data) noexcept {
  try {
    if ((size > 0 && data == nullptr) ||
        size > kMaxWorkerWorkMessageBytes ||
        pendingResponses_.size() >= kMaxWorkerWorkMessages ||
        responseBytes_ + size > kMaxWorkerWorkTotalBytes) {
      return kLv2WorkerErrNoSpace;
    }
    std::vector<std::uint8_t> response;
    if (size > 0) {
      const auto* bytes = static_cast<const std::uint8_t*>(data);
      response.assign(bytes, bytes + size);
    }
    responseBytes_ += response.size();
    pendingResponses_.push_back(std::move(response));
    return kLv2WorkerSuccess;
  } catch (...) {
    return kLv2WorkerErrUnknown;
  }
}

} // namespace plugrelay::lv2_worker
