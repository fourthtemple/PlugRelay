#pragma once

#include "PlugRelay/Lv2HostWorkerSupport.h"

#include <cstdint>
#include <vector>

namespace plugrelay::lv2_worker {

std::vector<std::uint64_t> emptyLv2MidiSequenceBuffer(std::uint32_t maxBlockSize);

std::vector<std::uint64_t> lv2MidiSequenceBuffer(
    const Lv2Port& port,
    const std::vector<PendingMidiMessage>& messages,
    std::uint32_t frameOffset,
    std::uint32_t frames,
    std::uint32_t totalFrames,
    const HostTransportContext& transport);

} // namespace plugrelay::lv2_worker
