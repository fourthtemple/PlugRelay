#include "SoundBridge/Lv2Abi.h"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <string>

namespace {

using namespace soundbridge::lv2_abi;

constexpr const char* kLv2UridMapUri = "http://lv2plug.in/ns/ext/urid#map";
constexpr const char* kLv2AtomFloatUri = "http://lv2plug.in/ns/ext/atom#Float";
constexpr const char* kLv2AtomPathUri = "http://lv2plug.in/ns/ext/atom#Path";
constexpr const char* kLv2MidiEventUri = "http://lv2plug.in/ns/ext/midi#MidiEvent";
constexpr const char* kLv2StateFreePathUri = "http://lv2plug.in/ns/ext/state#freePath";
constexpr const char* kLv2StateInterfaceUri = "http://lv2plug.in/ns/ext/state#interface";
constexpr const char* kLv2StateMakePathUri = "http://lv2plug.in/ns/ext/state#makePath";
constexpr const char* kLv2StateMapPathUri = "http://lv2plug.in/ns/ext/state#mapPath";
constexpr const char* kLv2WorkerInterfaceUri = "http://lv2plug.in/ns/ext/worker#interface";
constexpr const char* kLv2WorkerScheduleUri = "http://lv2plug.in/ns/ext/worker#schedule";
constexpr const char* kMidiGainFileStateUri = "urn:soundbridge:example:lv2-gain#midiGainFile";
constexpr const char* kMidiGainStateUri = "urn:soundbridge:example:lv2-gain#midiGain";
constexpr float kExampleLatencyFrames = 17.0F;
constexpr std::uint32_t kLv2StateSuccess = 0;
constexpr std::uint32_t kLv2StateErrBadType = 2;
constexpr std::uint32_t kLv2StateErrNoFeature = 4;
constexpr std::uint32_t kLv2StateIsPod = 1U << 0U;
constexpr std::uint32_t kLv2StateIsPortable = 1U << 1U;
constexpr std::uint32_t kLv2WorkerSuccess = 0;
constexpr std::uint32_t kLv2WorkerErrUnknown = 1;

enum PortIndex : std::uint32_t {
  kGain = 0,
  kInputLeft = 1,
  kInputRight = 2,
  kOutputLeft = 3,
  kOutputRight = 4,
  kLatency = 5,
  kMidiIn = 6,
  kMode = 7,
};

struct GainPlugin {
  const float* gain = nullptr;
  const float* inputLeft = nullptr;
  const float* inputRight = nullptr;
  float* outputLeft = nullptr;
  float* outputRight = nullptr;
  float* latency = nullptr;
  const LV2_Atom_Sequence* midiIn = nullptr;
  const float* mode = nullptr;
  LV2_URID midiEventUrid = 0;
  LV2_URID midiGainFileKeyUrid = 0;
  LV2_URID midiGainKeyUrid = 0;
  LV2_URID atomFloatUrid = 0;
  LV2_URID atomPathUrid = 0;
  const LV2_Worker_Schedule* workerSchedule = nullptr;
  float midiGain = 1.0F;
  float workerGain = 1.0F;
};

std::size_t alignAtomSize(std::size_t size) {
  return (size + 7U) & ~std::size_t(7U);
}

LV2_Handle instantiate(
    const LV2_Descriptor* /* descriptor */,
    double /* sampleRate */,
    const char* /* bundlePath */,
    const LV2_Feature* const* features) {
  auto* plugin = new GainPlugin();
  if (features != nullptr) {
    for (const LV2_Feature* const* feature = features; *feature != nullptr; ++feature) {
      if ((*feature)->URI == nullptr || (*feature)->data == nullptr) {
        continue;
      }
      if (std::strcmp((*feature)->URI, kLv2WorkerScheduleUri) == 0) {
        plugin->workerSchedule = static_cast<const LV2_Worker_Schedule*>((*feature)->data);
        continue;
      }
      if (std::strcmp((*feature)->URI, kLv2UridMapUri) != 0) {
        continue;
      }
      auto* uridMap = static_cast<const LV2_URID_Map*>((*feature)->data);
      if (uridMap->map != nullptr) {
        plugin->midiEventUrid = uridMap->map(uridMap->handle, kLv2MidiEventUri);
        plugin->midiGainFileKeyUrid = uridMap->map(uridMap->handle, kMidiGainFileStateUri);
        plugin->midiGainKeyUrid = uridMap->map(uridMap->handle, kMidiGainStateUri);
        plugin->atomFloatUrid = uridMap->map(uridMap->handle, kLv2AtomFloatUri);
        plugin->atomPathUrid = uridMap->map(uridMap->handle, kLv2AtomPathUri);
      }
    }
  }
  return plugin;
}

void connectPort(LV2_Handle instance, std::uint32_t port, void* dataLocation) {
  auto* plugin = static_cast<GainPlugin*>(instance);
  switch (port) {
    case kGain:
      plugin->gain = static_cast<const float*>(dataLocation);
      break;
    case kInputLeft:
      plugin->inputLeft = static_cast<const float*>(dataLocation);
      break;
    case kInputRight:
      plugin->inputRight = static_cast<const float*>(dataLocation);
      break;
    case kOutputLeft:
      plugin->outputLeft = static_cast<float*>(dataLocation);
      break;
    case kOutputRight:
      plugin->outputRight = static_cast<float*>(dataLocation);
      break;
    case kLatency:
      plugin->latency = static_cast<float*>(dataLocation);
      break;
    case kMidiIn:
      plugin->midiIn = static_cast<const LV2_Atom_Sequence*>(dataLocation);
      break;
    case kMode:
      plugin->mode = static_cast<const float*>(dataLocation);
      break;
    default:
      break;
  }
}

void applyMidi(GainPlugin& plugin) {
  if (plugin.midiIn == nullptr || plugin.midiEventUrid == 0 ||
      plugin.midiIn->atom.size < sizeof(LV2_Atom_Sequence_Body)) {
    return;
  }

  const auto sequenceBytes = static_cast<std::size_t>(plugin.midiIn->atom.size) + sizeof(LV2_Atom);
  const auto* bytes = reinterpret_cast<const std::uint8_t*>(plugin.midiIn);
  std::size_t offset = sizeof(LV2_Atom_Sequence);
  while (offset + sizeof(LV2_Atom_Event) <= sequenceBytes) {
    const auto* event = reinterpret_cast<const LV2_Atom_Event*>(bytes + offset);
    const auto bodyOffset = offset + sizeof(LV2_Atom_Event);
    const auto nextOffset = bodyOffset + alignAtomSize(event->body.size);
    if (bodyOffset + event->body.size > sequenceBytes || nextOffset <= offset) {
      break;
    }

    if (event->body.type == plugin.midiEventUrid && event->body.size >= 3) {
      const auto* midi = bytes + bodyOffset;
      if ((midi[0] & 0xF0U) == 0xB0U && midi[1] == 7U) {
        plugin.midiGain = std::clamp(static_cast<float>(midi[2]) / 127.0F, 0.0F, 1.0F);
      } else if ((midi[0] & 0xF0U) == 0xB0U && midi[1] == 8U &&
          plugin.workerSchedule != nullptr && plugin.workerSchedule->schedule_work != nullptr) {
        const std::uint8_t value = midi[2];
        plugin.workerSchedule->schedule_work(plugin.workerSchedule->handle, sizeof(value), &value);
      }
    }
    offset = nextOffset;
  }
}

void run(LV2_Handle instance, std::uint32_t sampleCount) {
  auto* plugin = static_cast<GainPlugin*>(instance);
  if (plugin->latency != nullptr) {
    *plugin->latency = kExampleLatencyFrames;
  }
  applyMidi(*plugin);
  const float gain = std::clamp(plugin->gain == nullptr ? 1.0F : *plugin->gain, 0.0F, 2.0F) *
      plugin->midiGain *
      plugin->workerGain;
  for (std::uint32_t frame = 0; frame < sampleCount; ++frame) {
    if (plugin->outputLeft != nullptr) {
      plugin->outputLeft[frame] = (plugin->inputLeft == nullptr ? 0.0F : plugin->inputLeft[frame]) * gain;
    }
    if (plugin->outputRight != nullptr) {
      plugin->outputRight[frame] = (plugin->inputRight == nullptr ? 0.0F : plugin->inputRight[frame]) * gain;
    }
  }
}

const LV2_State_Map_Path* stateMapPathFeature(const LV2_Feature* const* features) {
  if (features == nullptr) {
    return nullptr;
  }
  for (const LV2_Feature* const* feature = features; *feature != nullptr; ++feature) {
    if ((*feature)->URI != nullptr && (*feature)->data != nullptr &&
        std::strcmp((*feature)->URI, kLv2StateMapPathUri) == 0) {
      return static_cast<const LV2_State_Map_Path*>((*feature)->data);
    }
  }
  return nullptr;
}

const LV2_State_Make_Path* stateMakePathFeature(const LV2_Feature* const* features) {
  if (features == nullptr) {
    return nullptr;
  }
  for (const LV2_Feature* const* feature = features; *feature != nullptr; ++feature) {
    if ((*feature)->URI != nullptr && (*feature)->data != nullptr &&
        std::strcmp((*feature)->URI, kLv2StateMakePathUri) == 0) {
      return static_cast<const LV2_State_Make_Path*>((*feature)->data);
    }
  }
  return nullptr;
}

const LV2_State_Free_Path* stateFreePathFeature(const LV2_Feature* const* features) {
  if (features == nullptr) {
    return nullptr;
  }
  for (const LV2_Feature* const* feature = features; *feature != nullptr; ++feature) {
    if ((*feature)->URI != nullptr && (*feature)->data != nullptr &&
        std::strcmp((*feature)->URI, kLv2StateFreePathUri) == 0) {
      return static_cast<const LV2_State_Free_Path*>((*feature)->data);
    }
  }
  return nullptr;
}

void freeStatePath(const LV2_State_Free_Path* freePath, char* path) {
  if (freePath != nullptr && freePath->free_path != nullptr && path != nullptr) {
    freePath->free_path(freePath->handle, path);
  }
}

LV2_State_Status saveState(
    LV2_Handle instance,
    LV2_State_Store_Function store,
    LV2_State_Handle handle,
    std::uint32_t /* flags */,
    const LV2_Feature* const* features) {
  auto* plugin = static_cast<GainPlugin*>(instance);
  if (store == nullptr || plugin->midiGainKeyUrid == 0 || plugin->atomFloatUrid == 0) {
    return kLv2StateErrNoFeature;
  }
  const float value = std::clamp(plugin->midiGain, 0.0F, 1.0F);
  const float fallbackValue = 1.0F;
  const auto fallbackStatus = store(
      handle,
      plugin->midiGainKeyUrid,
      &fallbackValue,
      sizeof(fallbackValue),
      plugin->atomFloatUrid,
      kLv2StateIsPod | kLv2StateIsPortable);
  if (fallbackStatus != kLv2StateSuccess) {
    return fallbackStatus;
  }

  const auto* mapPath = stateMapPathFeature(features);
  const auto* makePath = stateMakePathFeature(features);
  const auto* freePath = stateFreePathFeature(features);
  if (mapPath == nullptr || mapPath->abstract_path == nullptr || makePath == nullptr || makePath->path == nullptr ||
      freePath == nullptr || freePath->free_path == nullptr || plugin->midiGainFileKeyUrid == 0 ||
      plugin->atomPathUrid == 0) {
    return kLv2StateSuccess;
  }

  char* absolutePath = makePath->path(makePath->handle, "midi-gain.txt");
  if (absolutePath == nullptr) {
    return kLv2StateSuccess;
  }

  {
    std::ofstream output(absolutePath, std::ios::binary | std::ios::trunc);
    if (!output) {
      freeStatePath(freePath, absolutePath);
      return kLv2StateSuccess;
    }
    output << value << "\n";
    if (!output) {
      freeStatePath(freePath, absolutePath);
      return kLv2StateSuccess;
    }
  }

  char* abstractPath = mapPath->abstract_path(mapPath->handle, absolutePath);
  freeStatePath(freePath, absolutePath);
  if (abstractPath == nullptr) {
    return kLv2StateSuccess;
  }

  const auto pathStatus = store(
      handle,
      plugin->midiGainFileKeyUrid,
      abstractPath,
      std::strlen(abstractPath) + 1,
      plugin->atomPathUrid,
      kLv2StateIsPod | kLv2StateIsPortable);
  freeStatePath(freePath, abstractPath);
  return pathStatus;
}

LV2_State_Status restoreState(
    LV2_Handle instance,
    LV2_State_Retrieve_Function retrieve,
    LV2_State_Handle handle,
    std::uint32_t /* flags */,
    const LV2_Feature* const* features) {
  auto* plugin = static_cast<GainPlugin*>(instance);
  if (retrieve == nullptr || plugin->midiGainKeyUrid == 0 || plugin->atomFloatUrid == 0) {
    return kLv2StateErrNoFeature;
  }

  std::size_t size = 0;
  std::uint32_t type = 0;
  std::uint32_t flags = 0;
  const auto* value = retrieve(handle, plugin->midiGainKeyUrid, &size, &type, &flags);
  if (value == nullptr) {
    return kLv2StateSuccess;
  }
  if (size != sizeof(float) || type != plugin->atomFloatUrid || (flags & kLv2StateIsPod) == 0) {
    return kLv2StateErrBadType;
  }

  float restored = 1.0F;
  std::memcpy(&restored, value, sizeof(restored));
  plugin->midiGain = std::clamp(restored, 0.0F, 1.0F);

  const auto* mapPath = stateMapPathFeature(features);
  const auto* freePath = stateFreePathFeature(features);
  if (mapPath == nullptr || mapPath->absolute_path == nullptr || freePath == nullptr ||
      freePath->free_path == nullptr || plugin->midiGainFileKeyUrid == 0 || plugin->atomPathUrid == 0) {
    return kLv2StateSuccess;
  }

  size = 0;
  type = 0;
  flags = 0;
  const auto* pathValue = retrieve(handle, plugin->midiGainFileKeyUrid, &size, &type, &flags);
  if (pathValue == nullptr) {
    return kLv2StateSuccess;
  }
  if (size == 0 || type != plugin->atomPathUrid || (flags & kLv2StateIsPod) == 0 ||
      std::memchr(pathValue, '\0', size) == nullptr) {
    return kLv2StateErrBadType;
  }

  char* absolutePath = mapPath->absolute_path(mapPath->handle, static_cast<const char*>(pathValue));
  if (absolutePath == nullptr) {
    return kLv2StateSuccess;
  }
  std::ifstream input(absolutePath, std::ios::binary);
  if (input) {
    float fileValue = 1.0F;
    input >> fileValue;
    if (input) {
      plugin->midiGain = std::clamp(fileValue, 0.0F, 1.0F);
    }
  }
  freeStatePath(freePath, absolutePath);
  return kLv2StateSuccess;
}

LV2_Worker_Status workerWork(
    LV2_Handle /* instance */,
    LV2_Worker_Respond_Function respond,
    LV2_Worker_Respond_Handle handle,
    std::uint32_t size,
    const void* data) {
  if (respond == nullptr || size != sizeof(std::uint8_t) || data == nullptr) {
    return kLv2WorkerErrUnknown;
  }
  std::uint8_t value = 0;
  std::memcpy(&value, data, sizeof(value));
  return respond(handle, sizeof(value), &value);
}

LV2_Worker_Status workerResponse(LV2_Handle instance, std::uint32_t size, const void* body) {
  auto* plugin = static_cast<GainPlugin*>(instance);
  if (plugin == nullptr || size != sizeof(std::uint8_t) || body == nullptr) {
    return kLv2WorkerErrUnknown;
  }
  std::uint8_t value = 0;
  std::memcpy(&value, body, sizeof(value));
  plugin->workerGain = std::clamp(static_cast<float>(value) / 127.0F, 0.0F, 1.0F);
  return kLv2WorkerSuccess;
}

LV2_Worker_Status workerEndRun(LV2_Handle /* instance */) {
  return kLv2WorkerSuccess;
}

void cleanup(LV2_Handle instance) {
  delete static_cast<GainPlugin*>(instance);
}

const LV2_State_Interface kStateInterface {
    saveState,
    restoreState};

const LV2_Worker_Interface kWorkerInterface {
    workerWork,
    workerResponse,
    workerEndRun};

const void* extensionData(const char* uri) {
  if (uri != nullptr && std::strcmp(uri, kLv2StateInterfaceUri) == 0) {
    return &kStateInterface;
  }
  if (uri != nullptr && std::strcmp(uri, kLv2WorkerInterfaceUri) == 0) {
    return &kWorkerInterface;
  }
  return nullptr;
}

const LV2_Descriptor kDescriptor {
    "urn:soundbridge:example:lv2-gain",
    instantiate,
    connectPort,
    nullptr,
    run,
    nullptr,
    cleanup,
    extensionData};

} // namespace

extern "C" const LV2_Descriptor* lv2_descriptor(std::uint32_t index) {
  return index == 0 ? &kDescriptor : nullptr;
}
