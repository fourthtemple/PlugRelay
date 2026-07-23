#include "PlugRelay/Lv2StateSupport.h"

#include "PlugRelay/Base64.h"
#include "PlugRelay/Lv2HostWorkerSupport.h"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <optional>
#include <set>
#include <stdexcept>
#include <utility>

namespace plugrelay::lv2_worker {

using namespace lv2_abi;

namespace {

class Lv2StateFileBroker;

struct Lv2StateSaveContext {
  Lv2UridMapper* mapper = nullptr;
  std::vector<Lv2StateProperty>* properties = nullptr;
  std::vector<Lv2StateFile>* files = nullptr;
  Lv2StateFileBroker* fileBroker = nullptr;
  std::size_t totalValueBytes = 0;
  std::size_t totalFileBytes = 0;
};

struct Lv2StateRestoreContext {
  const std::vector<Lv2RestoredStateProperty>* properties = nullptr;
};

class Lv2StateFileBroker {
public:
  Lv2StateFileBroker() {
    const auto seed = std::chrono::steady_clock::now().time_since_epoch().count();
    const auto base = std::filesystem::temp_directory_path() /
        ("plugrelay-lv2-state-" + std::to_string(seed));
    for (std::uint32_t index = 0; index < 32; ++index) {
      auto candidate = base;
      if (index > 0) {
        candidate += "-" + std::to_string(index);
      }
      std::error_code error;
      if (std::filesystem::create_directory(candidate, error)) {
        root_ = std::move(candidate);
        return;
      }
    }
    throw std::runtime_error("lv2_state_broker_unavailable");
  }

  Lv2StateFileBroker(const Lv2StateFileBroker&) = delete;
  Lv2StateFileBroker& operator=(const Lv2StateFileBroker&) = delete;

  ~Lv2StateFileBroker() {
    std::error_code error;
    std::filesystem::remove_all(root_, error);
  }

  char* makePath(const char* pathText) {
    const auto relativePath = safeRelativePath(pathText);
    if (!relativePath) {
      return nullptr;
    }
    const auto absolutePath = (root_ / *relativePath).lexically_normal();
    std::error_code error;
    std::filesystem::create_directories(absolutePath.parent_path(), error);
    if (error) {
      return nullptr;
    }
    return duplicateCString(absolutePath.string());
  }

  char* abstractPath(const char* absolutePathText) {
    if (absolutePathText == nullptr || *absolutePathText == '\0') {
      return nullptr;
    }
    std::error_code error;
    const auto root = std::filesystem::weakly_canonical(root_, error);
    if (error) {
      return nullptr;
    }
    const auto absolutePath = std::filesystem::weakly_canonical(std::filesystem::path(absolutePathText), error);
    if (error || !pathIsInsideRoot(absolutePath, root)) {
      return nullptr;
    }
    const auto relativePath = std::filesystem::relative(absolutePath, root, error);
    if (error || !safeRelativePath(relativePath.generic_string().c_str())) {
      return nullptr;
    }
    return duplicateCString(relativePath.generic_string());
  }

  char* absolutePath(const char* abstractPathText) {
    const auto relativePath = safeRelativePath(abstractPathText);
    if (!relativePath) {
      return nullptr;
    }
    return duplicateCString((root_ / *relativePath).lexically_normal().string());
  }

  bool recordFile(const std::string& abstractPath, std::vector<Lv2StateFile>& files, std::size_t& totalFileBytes) const {
    if (files.size() >= kMaxWorkerStateFiles) {
      return false;
    }
    for (const auto& file : files) {
      if (file.abstractPath == abstractPath) {
        return true;
      }
    }
    const auto relativePath = safeRelativePath(abstractPath.c_str());
    if (!relativePath) {
      return false;
    }
    const auto absolutePath = (root_ / *relativePath).lexically_normal();
    std::error_code error;
    if (std::filesystem::is_symlink(std::filesystem::symlink_status(absolutePath, error)) || error ||
        !std::filesystem::is_regular_file(absolutePath, error) || error) {
      return false;
    }
    const auto size = std::filesystem::file_size(absolutePath, error);
    if (error || size == 0 || size > kMaxWorkerStateFileBytes ||
        totalFileBytes + size > kMaxWorkerStateFileTotalBytes) {
      return false;
    }
    std::ifstream input(absolutePath, std::ios::binary);
    if (!input) {
      return false;
    }
    std::vector<std::uint8_t> bytes(size);
    input.read(reinterpret_cast<char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    if (!input) {
      return false;
    }
    totalFileBytes += bytes.size();
    files.push_back(Lv2StateFile{abstractPath, std::move(bytes)});
    return true;
  }

  bool materializeFiles(const std::vector<Lv2StateFile>& files) {
    std::size_t totalFileBytes = 0;
    std::set<std::string> seenPaths;
    for (const auto& file : files) {
      if (file.value.empty() || file.value.size() > kMaxWorkerStateFileBytes ||
          totalFileBytes + file.value.size() > kMaxWorkerStateFileTotalBytes) {
        return false;
      }
      if (!seenPaths.insert(file.abstractPath).second) {
        return false;
      }
      const auto relativePath = safeRelativePath(file.abstractPath.c_str());
      if (!relativePath) {
        return false;
      }
      const auto absolutePath = (root_ / *relativePath).lexically_normal();
      std::error_code error;
      std::filesystem::create_directories(absolutePath.parent_path(), error);
      if (error || std::filesystem::is_symlink(std::filesystem::symlink_status(absolutePath, error))) {
        return false;
      }
      std::ofstream output(absolutePath, std::ios::binary | std::ios::trunc);
      if (!output) {
        return false;
      }
      output.write(reinterpret_cast<const char*>(file.value.data()), static_cast<std::streamsize>(file.value.size()));
      if (!output) {
        return false;
      }
      totalFileBytes += file.value.size();
    }
    return true;
  }

  static void freePath(char* path) {
    delete[] path;
  }

private:
  static char* duplicateCString(const std::string& value) {
    auto* output = new char[value.size() + 1];
    std::memcpy(output, value.c_str(), value.size() + 1);
    return output;
  }

  static std::optional<std::filesystem::path> safeRelativePath(const char* pathText) {
    if (pathText == nullptr || *pathText == '\0') {
      return std::nullopt;
    }
    const std::string text(pathText);
    if (text.size() > kMaxWorkerStatePathBytes || text.find('\\') != std::string::npos) {
      return std::nullopt;
    }
    if (std::any_of(text.begin(), text.end(), [](unsigned char character) {
      return character == '\0' || character < 0x20 || character == 0x7F;
    })) {
      return std::nullopt;
    }
    const std::filesystem::path relativePath(text);
    if (relativePath.empty() || relativePath.is_absolute()) {
      return std::nullopt;
    }
    for (const auto& part : relativePath) {
      const auto partText = part.generic_string();
      if (partText.empty() || partText == "." || partText == "..") {
        return std::nullopt;
      }
    }
    return relativePath.lexically_normal();
  }

  static bool pathIsInsideRoot(const std::filesystem::path& child, const std::filesystem::path& root) {
    auto childIterator = child.begin();
    auto rootIterator = root.begin();
    for (; rootIterator != root.end(); ++rootIterator, ++childIterator) {
      if (childIterator == child.end() || *childIterator != *rootIterator) {
        return false;
      }
    }
    return true;
  }

  std::filesystem::path root_;
};

char* makeLv2StatePath(LV2_State_Make_Path_Handle handle, const char* path) {
  if (handle == nullptr) {
    return nullptr;
  }
  return static_cast<Lv2StateFileBroker*>(handle)->makePath(path);
}

char* abstractLv2StatePath(LV2_State_Map_Path_Handle handle, const char* absolutePath) {
  if (handle == nullptr) {
    return nullptr;
  }
  return static_cast<Lv2StateFileBroker*>(handle)->abstractPath(absolutePath);
}

char* absoluteLv2StatePath(LV2_State_Map_Path_Handle handle, const char* abstractPath) {
  if (handle == nullptr) {
    return nullptr;
  }
  return static_cast<Lv2StateFileBroker*>(handle)->absolutePath(abstractPath);
}

void freeLv2StatePath(LV2_State_Free_Path_Handle /* handle */, char* path) {
  Lv2StateFileBroker::freePath(path);
}

std::string statePathValueToString(const void* value, std::size_t size) {
  if (value == nullptr || size == 0 || size > kMaxWorkerStatePathBytes + 1) {
    return "";
  }
  const auto* bytes = static_cast<const char*>(value);
  std::size_t length = 0;
  while (length < size && bytes[length] != '\0') {
    ++length;
  }
  if (length == size) {
    return "";
  }
  return std::string(bytes, bytes + length);
}

LV2_State_Status storeLv2StateProperty(
    LV2_State_Handle handle,
    std::uint32_t key,
    const void* value,
    std::size_t size,
    std::uint32_t type,
    std::uint32_t flags) {
  auto* context = static_cast<Lv2StateSaveContext*>(handle);
  if (context == nullptr || context->mapper == nullptr || context->properties == nullptr || value == nullptr || size == 0) {
    return kLv2StateErrUnknown;
  }
  if (size > kMaxWorkerStatePropertyBytes ||
      context->totalValueBytes + size > kMaxWorkerStateBytes / 2 ||
      context->properties->size() >= kMaxWorkerStateProperties) {
    return kLv2StateErrNoSpace;
  }

  const char* keyUri = context->mapper->unmap(key);
  const char* typeUri = context->mapper->unmap(type);
  if (keyUri == nullptr || typeUri == nullptr || !isValidStateUri(keyUri) || !isValidStateUri(typeUri)) {
    return kLv2StateErrBadType;
  }
  if (type == kUridAtomPath) {
    if ((flags & kLv2StateIsPod) == 0 || (flags & kLv2StateIsNative) != 0 ||
        context->fileBroker == nullptr || context->files == nullptr) {
      return kLv2StateErrBadFlags;
    }
    const auto abstractPath = statePathValueToString(value, size);
    if (abstractPath.empty() ||
        !context->fileBroker->recordFile(abstractPath, *context->files, context->totalFileBytes)) {
      return kLv2StateErrNoSpace;
    }
  } else if (!isPortablePodState(flags)) {
    return kLv2StateErrBadFlags;
  }

  auto* bytes = static_cast<const std::uint8_t*>(value);
  context->properties->push_back(Lv2StateProperty{
      keyUri,
      typeUri,
      flags,
      std::vector<std::uint8_t>(bytes, bytes + size)});
  context->totalValueBytes += size;
  return kLv2StateSuccess;
}

const void* retrieveLv2StateProperty(
    LV2_State_Handle handle,
    std::uint32_t key,
    std::size_t* size,
    std::uint32_t* type,
    std::uint32_t* flags) {
  auto* context = static_cast<Lv2StateRestoreContext*>(handle);
  if (context == nullptr || context->properties == nullptr) {
    return nullptr;
  }
  for (const auto& property : *context->properties) {
    if (property.key != key) {
      continue;
    }
    if (size != nullptr) {
      *size = property.value.size();
    }
    if (type != nullptr) {
      *type = property.type;
    }
    if (flags != nullptr) {
      *flags = property.flags;
    }
    return property.value.data();
  }
  return nullptr;
}

} // namespace

Lv2UridMapper::Lv2UridMapper() {
  mappings_.reserve(kMaxWorkerUridMappings);
  addKnown(kUridAtomSequence, kLv2AtomSequenceUri);
  addKnown(kUridAtomFrameTime, kLv2AtomFrameTimeUri);
  addKnown(kUridMidiEvent, kLv2MidiEventUri);
  addKnown(kUridAtomFloat, kLv2AtomFloatUri);
  addKnown(kUridAtomPath, kLv2AtomPathUri);
  addKnown(kUridAtomInt, kLv2AtomIntUri);
  addKnown(kUridAtomLong, kLv2AtomLongUri);
  addKnown(kUridAtomDouble, kLv2AtomDoubleUri);
  addKnown(kUridAtomObject, kLv2AtomObjectUri);
  addKnown(kUridTimePosition, kLv2TimePositionUri);
  addKnown(kUridTimeFrame, kLv2TimeFrameUri);
  addKnown(kUridTimeSpeed, kLv2TimeSpeedUri);
  addKnown(kUridTimeBeat, kLv2TimeBeatUri);
  addKnown(kUridTimeBarBeat, kLv2TimeBarBeatUri);
  addKnown(kUridTimeBeatUnit, kLv2TimeBeatUnitUri);
  addKnown(kUridTimeBeatsPerBar, kLv2TimeBeatsPerBarUri);
  addKnown(kUridTimeBeatsPerMinute, kLv2TimeBeatsPerMinuteUri);
  addKnown(kUridBufSizeMaxBlockLength, kLv2BufSizeMaxBlockLengthUri);
  addKnown(kUridBufSizeMinBlockLength, kLv2BufSizeMinBlockLengthUri);
  addKnown(kUridBufSizeNominalBlockLength, kLv2BufSizeNominalBlockLengthUri);
  addKnown(kUridBufSizeSequenceSize, kLv2BufSizeSequenceSizeUri);
  nextUrid_ = kUridBufSizeSequenceSize + 1;
}

LV2_URID Lv2UridMapper::map(const char* uri) {
  if (uri == nullptr || *uri == '\0') {
    return 0;
  }
  const std::string text(uri);
  if (text.size() > kMaxWorkerUriBytes) {
    return 0;
  }
  for (const auto& mapping : mappings_) {
    if (mapping.uri == text) {
      return mapping.urid;
    }
  }
  if (mappings_.size() >= kMaxWorkerUridMappings) {
    return 0;
  }
  const auto urid = nextUrid_++;
  mappings_.push_back(Lv2MappedUri{urid, text});
  return urid;
}

const char* Lv2UridMapper::unmap(LV2_URID urid) const {
  for (const auto& mapping : mappings_) {
    if (mapping.urid == urid) {
      return mapping.uri.c_str();
    }
  }
  return nullptr;
}

void Lv2UridMapper::addKnown(LV2_URID urid, const char* uri) {
  mappings_.push_back(Lv2MappedUri{urid, uri});
}

LV2_URID mapLv2Urid(LV2_URID_Map_Handle handle, const char* uri) {
  if (handle == nullptr) {
    return 0;
  }
  return static_cast<Lv2UridMapper*>(handle)->map(uri);
}

const char* unmapLv2Urid(LV2_URID_Unmap_Handle handle, LV2_URID urid) {
  if (handle == nullptr) {
    return nullptr;
  }
  return static_cast<const Lv2UridMapper*>(handle)->unmap(urid);
}

Lv2SavedExtensionState saveLv2ExtensionState(
    LV2_Handle handle,
    const LV2_State_Interface* stateInterface,
    Lv2UridMapper& uridMapper) {
  Lv2SavedExtensionState savedState;
  if (stateInterface == nullptr || stateInterface->save == nullptr || handle == nullptr) {
    return savedState;
  }

  Lv2StateFileBroker fileBroker;
  LV2_URID_Map uridMap {&uridMapper, &mapLv2Urid};
  LV2_URID_Unmap uridUnmap {&uridMapper, &unmapLv2Urid};
  LV2_State_Map_Path mapPath {&fileBroker, &abstractLv2StatePath, &absoluteLv2StatePath};
  LV2_State_Make_Path makePath {&fileBroker, &makeLv2StatePath};
  LV2_State_Free_Path freePath {&fileBroker, &freeLv2StatePath};
  LV2_Feature uridMapFeature {kLv2UridMapUri, &uridMap};
  LV2_Feature uridUnmapFeature {kLv2UridUnmapUri, &uridUnmap};
  LV2_Feature mapPathFeature {kLv2StateMapPathUri, &mapPath};
  LV2_Feature makePathFeature {kLv2StateMakePathUri, &makePath};
  LV2_Feature freePathFeature {kLv2StateFreePathUri, &freePath};
  const LV2_Feature* const features[] = {
      &uridMapFeature,
      &uridUnmapFeature,
      &mapPathFeature,
      &makePathFeature,
      &freePathFeature,
      nullptr};
  Lv2StateSaveContext context {
      &uridMapper,
      &savedState.properties,
      &savedState.files,
      &fileBroker,
      0,
      0};
  const auto status = stateInterface->save(
      handle,
      &storeLv2StateProperty,
      &context,
      kLv2StateIsPod | kLv2StateIsPortable,
      features);
  if (status != kLv2StateSuccess) {
    throw std::runtime_error("lv2_state_save_failed");
  }
  return savedState;
}

void restoreLv2ExtensionState(
    LV2_Handle handle,
    const LV2_State_Interface* stateInterface,
    Lv2UridMapper& uridMapper,
    const std::vector<Lv2RestoredStateProperty>& properties,
    const std::vector<Lv2StateFile>& files) {
  if (properties.empty() && files.empty()) {
    return;
  }
  if (stateInterface == nullptr || stateInterface->restore == nullptr || handle == nullptr) {
    throw std::runtime_error("lv2_state_extension_unavailable");
  }

  Lv2StateFileBroker fileBroker;
  if (!fileBroker.materializeFiles(files)) {
    throw std::runtime_error("lv2_state_file_restore_failed");
  }
  LV2_URID_Map uridMap {&uridMapper, &mapLv2Urid};
  LV2_URID_Unmap uridUnmap {&uridMapper, &unmapLv2Urid};
  LV2_State_Map_Path mapPath {&fileBroker, &abstractLv2StatePath, &absoluteLv2StatePath};
  LV2_State_Free_Path freePath {&fileBroker, &freeLv2StatePath};
  LV2_Feature uridMapFeature {kLv2UridMapUri, &uridMap};
  LV2_Feature uridUnmapFeature {kLv2UridUnmapUri, &uridUnmap};
  LV2_Feature mapPathFeature {kLv2StateMapPathUri, &mapPath};
  LV2_Feature freePathFeature {kLv2StateFreePathUri, &freePath};
  const LV2_Feature* const features[] = {
      &uridMapFeature,
      &uridUnmapFeature,
      &mapPathFeature,
      &freePathFeature,
      nullptr};
  Lv2StateRestoreContext context {&properties};
  const auto status = stateInterface->restore(handle, &retrieveLv2StateProperty, &context, 0, features);
  if (status != kLv2StateSuccess) {
    throw std::runtime_error("lv2_state_restore_failed");
  }
}

} // namespace plugrelay::lv2_worker
