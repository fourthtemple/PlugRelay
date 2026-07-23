#pragma once

#include "PlugRelay/Lv2Abi.h"

#include <cstdint>
#include <string>
#include <vector>

namespace plugrelay::lv2_worker {

struct Lv2StateProperty {
  std::string keyUri;
  std::string typeUri;
  std::uint32_t flags = 0;
  std::vector<std::uint8_t> value;
};

struct Lv2StateFile {
  std::string abstractPath;
  std::vector<std::uint8_t> value;
};

struct Lv2SavedExtensionState {
  std::vector<Lv2StateProperty> properties;
  std::vector<Lv2StateFile> files;
};

struct Lv2RestoredStateProperty {
  lv2_abi::LV2_URID key = 0;
  lv2_abi::LV2_URID type = 0;
  std::uint32_t flags = 0;
  std::vector<std::uint8_t> value;
};

class Lv2UridMapper {
public:
  Lv2UridMapper();

  lv2_abi::LV2_URID map(const char* uri);
  const char* unmap(lv2_abi::LV2_URID urid) const;

private:
  struct Lv2MappedUri {
    lv2_abi::LV2_URID urid = 0;
    std::string uri;
  };

  void addKnown(lv2_abi::LV2_URID urid, const char* uri);

  std::vector<Lv2MappedUri> mappings_;
  lv2_abi::LV2_URID nextUrid_ = 0;
};

lv2_abi::LV2_URID mapLv2Urid(lv2_abi::LV2_URID_Map_Handle handle, const char* uri);
const char* unmapLv2Urid(lv2_abi::LV2_URID_Unmap_Handle handle, lv2_abi::LV2_URID urid);

Lv2SavedExtensionState saveLv2ExtensionState(
    lv2_abi::LV2_Handle handle,
    const lv2_abi::LV2_State_Interface* stateInterface,
    Lv2UridMapper& uridMapper);

void restoreLv2ExtensionState(
    lv2_abi::LV2_Handle handle,
    const lv2_abi::LV2_State_Interface* stateInterface,
    Lv2UridMapper& uridMapper,
    const std::vector<Lv2RestoredStateProperty>& properties,
    const std::vector<Lv2StateFile>& files);

} // namespace plugrelay::lv2_worker
