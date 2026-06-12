#pragma once

#include <cstddef>
#include <cstdint>

namespace soundbridge::lv2_abi {

using LV2_Handle = void*;

struct LV2_Feature {
  const char* URI;
  void* data;
};

struct LV2_Descriptor {
  const char* URI;
  LV2_Handle (*instantiate)(
      const LV2_Descriptor* descriptor,
      double sampleRate,
      const char* bundlePath,
      const LV2_Feature* const* features);
  void (*connect_port)(LV2_Handle instance, std::uint32_t port, void* dataLocation);
  void (*activate)(LV2_Handle instance);
  void (*run)(LV2_Handle instance, std::uint32_t sampleCount);
  void (*deactivate)(LV2_Handle instance);
  void (*cleanup)(LV2_Handle instance);
  const void* (*extension_data)(const char* uri);
};

using Lv2DescriptorFunction = const LV2_Descriptor* (*)(std::uint32_t index);
using LV2_URID = std::uint32_t;
using LV2_URID_Map_Handle = void*;
using LV2_URID_Unmap_Handle = void*;
using LV2_State_Handle = void*;
using LV2_State_Free_Path_Handle = void*;
using LV2_State_Map_Path_Handle = void*;
using LV2_State_Make_Path_Handle = void*;
using LV2_Worker_Respond_Handle = void*;
using LV2_Worker_Schedule_Handle = void*;

enum LV2_Options_Context : std::uint32_t {
  LV2_OPTIONS_INSTANCE = 0,
  LV2_OPTIONS_RESOURCE = 1,
  LV2_OPTIONS_BLANK = 2,
  LV2_OPTIONS_PORT = 3,
};

struct LV2_Options_Option {
  LV2_Options_Context context;
  std::uint32_t subject;
  LV2_URID key;
  std::uint32_t size;
  LV2_URID type;
  const void* value;
};

struct LV2_URID_Map {
  LV2_URID_Map_Handle handle;
  LV2_URID (*map)(LV2_URID_Map_Handle handle, const char* uri);
};

struct LV2_URID_Unmap {
  LV2_URID_Unmap_Handle handle;
  const char* (*unmap)(LV2_URID_Unmap_Handle handle, LV2_URID urid);
};

using LV2_State_Status = std::uint32_t;
using LV2_State_Store_Function = LV2_State_Status (*)(
    LV2_State_Handle handle,
    std::uint32_t key,
    const void* value,
    std::size_t size,
    std::uint32_t type,
    std::uint32_t flags);
using LV2_State_Retrieve_Function = const void* (*)(
    LV2_State_Handle handle,
    std::uint32_t key,
    std::size_t* size,
    std::uint32_t* type,
    std::uint32_t* flags);

struct LV2_State_Interface {
  LV2_State_Status (*save)(
      LV2_Handle instance,
      LV2_State_Store_Function store,
      LV2_State_Handle handle,
      std::uint32_t flags,
      const LV2_Feature* const* features);
  LV2_State_Status (*restore)(
      LV2_Handle instance,
      LV2_State_Retrieve_Function retrieve,
      LV2_State_Handle handle,
      std::uint32_t flags,
      const LV2_Feature* const* features);
};

struct LV2_State_Map_Path {
  LV2_State_Map_Path_Handle handle;
  char* (*abstract_path)(LV2_State_Map_Path_Handle handle, const char* absolutePath);
  char* (*absolute_path)(LV2_State_Map_Path_Handle handle, const char* abstractPath);
};

struct LV2_State_Make_Path {
  LV2_State_Make_Path_Handle handle;
  char* (*path)(LV2_State_Make_Path_Handle handle, const char* path);
};

struct LV2_State_Free_Path {
  LV2_State_Free_Path_Handle handle;
  void (*free_path)(LV2_State_Free_Path_Handle handle, char* path);
};

using LV2_Worker_Status = std::uint32_t;
using LV2_Worker_Respond_Function = LV2_Worker_Status (*)(
    LV2_Worker_Respond_Handle handle,
    std::uint32_t size,
    const void* data);

struct LV2_Worker_Schedule {
  LV2_Worker_Schedule_Handle handle;
  LV2_Worker_Status (*schedule_work)(LV2_Worker_Schedule_Handle handle, std::uint32_t size, const void* data);
};

struct LV2_Worker_Interface {
  LV2_Worker_Status (*work)(
      LV2_Handle instance,
      LV2_Worker_Respond_Function respond,
      LV2_Worker_Respond_Handle handle,
      std::uint32_t size,
      const void* data);
  LV2_Worker_Status (*work_response)(LV2_Handle instance, std::uint32_t size, const void* body);
  LV2_Worker_Status (*end_run)(LV2_Handle instance);
};

struct LV2_Atom {
  std::uint32_t size;
  LV2_URID type;
};

struct LV2_Atom_Sequence_Body {
  LV2_URID unit;
  std::uint32_t pad;
};

struct LV2_Atom_Sequence {
  LV2_Atom atom;
  LV2_Atom_Sequence_Body body;
};

union LV2_Atom_Event_Time {
  std::int64_t frames;
  double beats;
};

struct LV2_Atom_Event {
  LV2_Atom_Event_Time time;
  LV2_Atom body;
};

struct LV2_Atom_Int {
  LV2_Atom atom;
  std::int32_t body;
};

struct LV2_Atom_Long {
  LV2_Atom atom;
  std::int64_t body;
};

struct LV2_Atom_Float {
  LV2_Atom atom;
  float body;
};

struct LV2_Atom_Double {
  LV2_Atom atom;
  double body;
};

struct LV2_Atom_Object_Body {
  std::uint32_t id;
  std::uint32_t otype;
};

struct LV2_Atom_Property_Body {
  LV2_URID key;
  LV2_URID context;
  LV2_Atom value;
};

} // namespace soundbridge::lv2_abi
