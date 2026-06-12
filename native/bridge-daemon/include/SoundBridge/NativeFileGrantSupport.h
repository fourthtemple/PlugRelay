#pragma once

#include <cstddef>
#include <istream>
#include <string>

namespace soundbridge::worker_file_grants {

struct NativeFileGrantCommand {
  std::string operation;
  std::string purpose;
  std::string access;
  std::string kind;
  std::string grantId;
  std::string displayName;
  std::string absolutePath;
};

struct DualStateFile {
  std::string primary;
  std::string secondary;
};

NativeFileGrantCommand parseFileGrantCommand(std::istream& stream);
std::string readSingleStateFile(const NativeFileGrantCommand& command, std::size_t maxBytes);
DualStateFile readDualStateFile(const NativeFileGrantCommand& command, std::size_t maxBytes);
std::string fileGrantAppliedJson();

} // namespace soundbridge::worker_file_grants
