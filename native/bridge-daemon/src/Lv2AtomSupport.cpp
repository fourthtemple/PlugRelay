#include "PlugRelay/Lv2AtomSupport.h"

#include "PlugRelay/Lv2Abi.h"

#include <algorithm>
#include <cstring>

namespace plugrelay::lv2_worker {

using namespace lv2_abi;

namespace {

enum class Lv2AtomScalarKind {
  Int,
  Long,
  Float,
  Double,
};

struct Lv2AtomScalarProperty {
  LV2_URID key = 0;
  Lv2AtomScalarKind kind = Lv2AtomScalarKind::Float;
  double value = 0.0;
};

LV2_URID atomTypeForScalar(Lv2AtomScalarKind kind) {
  switch (kind) {
    case Lv2AtomScalarKind::Int:
      return kUridAtomInt;
    case Lv2AtomScalarKind::Long:
      return kUridAtomLong;
    case Lv2AtomScalarKind::Float:
      return kUridAtomFloat;
    case Lv2AtomScalarKind::Double:
      return kUridAtomDouble;
  }
  return kUridAtomFloat;
}

std::size_t atomScalarBodySize(Lv2AtomScalarKind kind) {
  switch (kind) {
    case Lv2AtomScalarKind::Int:
      return sizeof(std::int32_t);
    case Lv2AtomScalarKind::Long:
      return sizeof(std::int64_t);
    case Lv2AtomScalarKind::Float:
      return sizeof(float);
    case Lv2AtomScalarKind::Double:
      return sizeof(double);
  }
  return sizeof(float);
}

std::size_t atomScalarPropertyBytes(Lv2AtomScalarKind kind) {
  return alignAtomSize(sizeof(LV2_Atom_Property_Body) + atomScalarBodySize(kind));
}

void writeAtomScalarBody(std::uint8_t* body, const Lv2AtomScalarProperty& property) {
  switch (property.kind) {
    case Lv2AtomScalarKind::Int: {
      const auto value = static_cast<std::int32_t>(std::clamp(property.value, -2147483648.0, 2147483647.0));
      std::memcpy(body, &value, sizeof(value));
      return;
    }
    case Lv2AtomScalarKind::Long: {
      const auto value = static_cast<std::int64_t>(std::clamp(
          property.value,
          static_cast<double>(-kMaxWorkerTransportSamplePosition),
          static_cast<double>(kMaxWorkerTransportSamplePosition)));
      std::memcpy(body, &value, sizeof(value));
      return;
    }
    case Lv2AtomScalarKind::Float: {
      const auto value = static_cast<float>(property.value);
      std::memcpy(body, &value, sizeof(value));
      return;
    }
    case Lv2AtomScalarKind::Double: {
      const auto value = property.value;
      std::memcpy(body, &value, sizeof(value));
      return;
    }
  }
}

std::vector<Lv2AtomScalarProperty> transportScalarProperties(const HostTransportContext& transport) {
  std::vector<Lv2AtomScalarProperty> properties;
  properties.reserve(8);
  properties.push_back(Lv2AtomScalarProperty{
      kUridTimeFrame,
      Lv2AtomScalarKind::Long,
      static_cast<double>(transport.samplePosition)});
  properties.push_back(Lv2AtomScalarProperty{
      kUridTimeSpeed,
      Lv2AtomScalarKind::Float,
      transport.playing ? 1.0 : 0.0});

  const auto beatFactor = transport.hasTimeSignature
      ? static_cast<double>(transport.timeSignatureDenominator) / 4.0
      : 1.0;
  if (transport.hasProjectTimeMusic) {
    properties.push_back(Lv2AtomScalarProperty{
        kUridTimeBeat,
        Lv2AtomScalarKind::Double,
        transport.projectTimeMusic * beatFactor});
  }
  if (transport.hasProjectTimeMusic && transport.hasBarPositionMusic) {
    auto barBeat = (transport.projectTimeMusic - transport.barPositionMusic) * beatFactor;
    if (transport.hasTimeSignature) {
      barBeat = std::clamp(barBeat, 0.0, static_cast<double>(transport.timeSignatureNumerator));
    }
    properties.push_back(Lv2AtomScalarProperty{
        kUridTimeBarBeat,
        Lv2AtomScalarKind::Float,
        std::max(0.0, barBeat)});
  }
  if (transport.hasTimeSignature) {
    properties.push_back(Lv2AtomScalarProperty{
        kUridTimeBeatUnit,
        Lv2AtomScalarKind::Int,
        static_cast<double>(transport.timeSignatureDenominator)});
    properties.push_back(Lv2AtomScalarProperty{
        kUridTimeBeatsPerBar,
        Lv2AtomScalarKind::Float,
        static_cast<double>(transport.timeSignatureNumerator)});
  }
  if (transport.hasTempo) {
    properties.push_back(Lv2AtomScalarProperty{
        kUridTimeBeatsPerMinute,
        Lv2AtomScalarKind::Float,
        transport.tempo});
  }
  return properties;
}

std::size_t transportObjectBodyBytes(const std::vector<Lv2AtomScalarProperty>& properties) {
  std::size_t bytes = sizeof(LV2_Atom_Object_Body);
  for (const auto& property : properties) {
    bytes += atomScalarPropertyBytes(property.kind);
  }
  return bytes;
}

std::size_t writeTransportEvent(
    std::uint8_t* bytes,
    std::size_t offset,
    const std::vector<Lv2AtomScalarProperty>& properties) {
  const auto objectBodyBytes = transportObjectBodyBytes(properties);
  auto* event = reinterpret_cast<LV2_Atom_Event*>(bytes + offset);
  event->time.frames = 0;
  event->body.type = kUridAtomObject;
  event->body.size = static_cast<std::uint32_t>(objectBodyBytes);

  auto* objectBody = reinterpret_cast<LV2_Atom_Object_Body*>(bytes + offset + sizeof(LV2_Atom_Event));
  objectBody->id = 0;
  objectBody->otype = kUridTimePosition;

  std::size_t propertyOffset = offset + sizeof(LV2_Atom_Event) + sizeof(LV2_Atom_Object_Body);
  for (const auto& property : properties) {
    auto* propertyBody = reinterpret_cast<LV2_Atom_Property_Body*>(bytes + propertyOffset);
    propertyBody->key = property.key;
    propertyBody->context = 0;
    propertyBody->value.type = atomTypeForScalar(property.kind);
    propertyBody->value.size = static_cast<std::uint32_t>(atomScalarBodySize(property.kind));
    writeAtomScalarBody(bytes + propertyOffset + sizeof(LV2_Atom_Property_Body), property);
    propertyOffset += atomScalarPropertyBytes(property.kind);
  }
  return offset + alignAtomSize(sizeof(LV2_Atom_Event) + objectBodyBytes);
}

} // namespace

std::vector<std::uint64_t> emptyLv2MidiSequenceBuffer(std::uint32_t maxBlockSize) {
  Lv2Port emptyPort;
  emptyPort.acceptsMidi = true;
  return lv2MidiSequenceBuffer(emptyPort, {}, 0, maxBlockSize, maxBlockSize, HostTransportContext {});
}

std::vector<std::uint64_t> lv2MidiSequenceBuffer(
    const Lv2Port& port,
    const std::vector<PendingMidiMessage>& messages,
    std::uint32_t frameOffset,
    std::uint32_t frames,
    std::uint32_t totalFrames,
    const HostTransportContext& transport) {
  const auto eventBytes = alignAtomSize(sizeof(LV2_Atom_Event) + 3);
  const auto includeTransport = port.acceptsTimePosition && transport.explicitTransport && frameOffset == 0;
  const auto transportProperties = includeTransport
      ? transportScalarProperties(transport)
      : std::vector<Lv2AtomScalarProperty> {};
  const auto transportEventBytes = includeTransport
      ? alignAtomSize(sizeof(LV2_Atom_Event) + transportObjectBodyBytes(transportProperties))
      : std::size_t {0};
  const auto segmentEnd = static_cast<std::uint64_t>(frameOffset) + frames;
  const auto lastFrame = totalFrames > 0 ? totalFrames - 1 : 0;
  std::size_t boundedCount = 0;
  if (port.acceptsMidi) {
    for (const auto& message : messages) {
      const auto effectiveOffset = std::min<std::uint32_t>(message.sampleOffset, lastFrame);
      if (effectiveOffset >= frameOffset && effectiveOffset < segmentEnd) {
        ++boundedCount;
      }
    }
  }
  boundedCount = std::min<std::size_t>(boundedCount, kMaxWorkerMidiEvents);
  const auto totalBytes = sizeof(LV2_Atom_Sequence) + transportEventBytes + eventBytes * boundedCount;
  std::vector<std::uint64_t> storage((alignAtomSize(totalBytes) + sizeof(std::uint64_t) - 1) / sizeof(std::uint64_t), 0);
  auto* sequence = reinterpret_cast<LV2_Atom_Sequence*>(storage.data());
  sequence->atom.type = kUridAtomSequence;
  sequence->atom.size = static_cast<std::uint32_t>(totalBytes - sizeof(LV2_Atom));
  sequence->body.unit = kUridAtomFrameTime;
  sequence->body.pad = 0;

  auto* bytes = reinterpret_cast<std::uint8_t*>(storage.data());
  std::size_t offset = sizeof(LV2_Atom_Sequence);
  if (includeTransport) {
    offset = writeTransportEvent(bytes, offset, transportProperties);
  }
  std::size_t emitted = 0;
  if (!port.acceptsMidi) {
    return storage;
  }
  for (const auto& message : messages) {
    if (emitted >= boundedCount) {
      break;
    }
    const auto effectiveOffset = std::min<std::uint32_t>(message.sampleOffset, lastFrame);
    if (effectiveOffset < frameOffset || effectiveOffset >= segmentEnd) {
      continue;
    }
    auto* event = reinterpret_cast<LV2_Atom_Event*>(bytes + offset);
    event->time.frames = effectiveOffset - frameOffset;
    event->body.type = kUridMidiEvent;
    event->body.size = 3;
    auto* body = bytes + offset + sizeof(LV2_Atom_Event);
    body[0] = message.status;
    body[1] = message.data1;
    body[2] = message.data2;
    offset += eventBytes;
    ++emitted;
  }
  return storage;
}

} // namespace plugrelay::lv2_worker
