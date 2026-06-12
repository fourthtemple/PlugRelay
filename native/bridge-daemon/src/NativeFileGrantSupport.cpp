#include "SoundBridge/NativeFileGrantSupport.h"

#include "SoundBridge/Base64.h"

#include <algorithm>
#include <cerrno>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <vector>

#ifndef _WIN32
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace soundbridge::worker_file_grants {

namespace {

constexpr std::size_t kMaxGrantIdBytes = 80;
constexpr std::size_t kMaxDisplayNameBytes = 256;
constexpr std::size_t kMaxPathBytes = 4096;

std::string requireToken(std::istream& stream) {
  std::string token;
  stream >> token;
  if (token.empty()) {
    throw std::runtime_error("invalid_file_grant_arguments");
  }
  return token;
}

void rejectExtraTokens(std::istream& stream) {
  std::string extra;
  if (stream >> extra) {
    throw std::runtime_error("invalid_file_grant_arguments");
  }
}

std::string boundedToken(std::string value, std::size_t maxBytes) {
  if (value.empty() || value.size() > maxBytes) {
    throw std::runtime_error("invalid_file_grant_arguments");
  }
  return value;
}

std::string decodeTextToken(const std::string& token, std::size_t maxBytes) {
  if (token == "-") {
    return "";
  }
  const auto decoded = base64Decode(token, maxBytes);
  return std::string(decoded.begin(), decoded.end());
}

bool hasControlCharacter(const std::string& value) {
  return std::any_of(value.begin(), value.end(), [](unsigned char character) {
    return character == '\0' || character < 0x20 || character == 0x7F;
  });
}

std::size_t checkedFileSize(std::uintmax_t size, std::size_t maxBytes) {
  if (size == 0 || size > maxBytes || size > std::numeric_limits<std::size_t>::max()) {
    throw std::runtime_error("file_grant_state_file_too_large");
  }
  return static_cast<std::size_t>(size);
}

void requireRestoreStateGrant(const NativeFileGrantCommand& command) {
  if (command.operation != "restoreState") {
    throw std::runtime_error("unsupported_file_grant_operation");
  }
  if (
      command.purpose != "state" ||
      command.kind != "file" ||
      (command.access != "read" && command.access != "readWrite") ||
      command.absolutePath.empty() ||
      hasControlCharacter(command.absolutePath) ||
      hasControlCharacter(command.displayName)) {
    throw std::runtime_error("invalid_file_grant_arguments");
  }
}

#ifndef _WIN32
class FileDescriptor {
public:
  explicit FileDescriptor(int value) : value_(value) {}

  ~FileDescriptor() {
    if (value_ >= 0) {
      close(value_);
    }
  }

  FileDescriptor(const FileDescriptor&) = delete;
  FileDescriptor& operator=(const FileDescriptor&) = delete;

  int get() const {
    return value_;
  }

private:
  int value_ = -1;
};

std::string readRegularFileNoFollow(const std::filesystem::path& path, std::size_t maxBytes) {
  int flags = O_RDONLY;
#ifdef O_CLOEXEC
  flags |= O_CLOEXEC;
#endif
#ifdef O_NOFOLLOW
  flags |= O_NOFOLLOW;
#endif

  const FileDescriptor descriptor(open(path.c_str(), flags));
  if (descriptor.get() < 0) {
    throw std::runtime_error("file_grant_state_file_unavailable");
  }

  struct stat info {};
  if (fstat(descriptor.get(), &info) != 0 || !S_ISREG(info.st_mode)) {
    throw std::runtime_error("file_grant_state_file_unavailable");
  }

  if (info.st_size <= 0) {
    throw std::runtime_error("file_grant_state_file_too_large");
  }
  const auto size = checkedFileSize(static_cast<std::uintmax_t>(info.st_size), maxBytes);
  std::string text(size, '\0');
  std::size_t offset = 0;
  while (offset < text.size()) {
    const auto bytesRead = read(descriptor.get(), text.data() + offset, text.size() - offset);
    if (bytesRead < 0 && errno == EINTR) {
      continue;
    }
    if (bytesRead <= 0) {
      throw std::runtime_error("file_grant_state_file_unavailable");
    }
    offset += static_cast<std::size_t>(bytesRead);
  }
  return text;
}
#endif

std::string readRegularFilePortable(const std::filesystem::path& path, std::size_t maxBytes) {
  std::error_code error;
  if (
      std::filesystem::is_symlink(std::filesystem::symlink_status(path, error)) ||
      error ||
      !std::filesystem::is_regular_file(path, error) ||
      error) {
    throw std::runtime_error("file_grant_state_file_unavailable");
  }
  const auto fileSize = std::filesystem::file_size(path, error);
  if (error) {
    throw std::runtime_error("file_grant_state_file_unavailable");
  }
  const auto size = checkedFileSize(fileSize, maxBytes);
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    throw std::runtime_error("file_grant_state_file_unavailable");
  }
  std::string text(size, '\0');
  input.read(text.data(), static_cast<std::streamsize>(text.size()));
  if (!input) {
    throw std::runtime_error("file_grant_state_file_unavailable");
  }
  return text;
}

std::string readStateFileText(const std::string& absolutePath, std::size_t maxBytes) {
  if (maxBytes == 0 || absolutePath.size() > kMaxPathBytes) {
    throw std::runtime_error("invalid_file_grant_arguments");
  }
  const std::filesystem::path path(absolutePath);
  if (!path.is_absolute()) {
    throw std::runtime_error("invalid_file_grant_arguments");
  }

#ifndef _WIN32
  return readRegularFileNoFollow(path, maxBytes);
#else
  return readRegularFilePortable(path, maxBytes);
#endif
}

std::vector<std::string> stateFileTokens(const NativeFileGrantCommand& command, std::size_t maxBytes) {
  requireRestoreStateGrant(command);
  const auto text = readStateFileText(command.absolutePath, maxBytes);
  std::stringstream stream(text);
  std::vector<std::string> tokens;
  std::string token;
  while (stream >> token) {
    if (token.size() > maxBytes) {
      throw std::runtime_error("file_grant_state_file_too_large");
    }
    tokens.push_back(token);
    if (tokens.size() > 2) {
      throw std::runtime_error("invalid_file_grant_state_file");
    }
  }
  if (tokens.empty()) {
    throw std::runtime_error("invalid_file_grant_state_file");
  }
  return tokens;
}

} // namespace

NativeFileGrantCommand parseFileGrantCommand(std::istream& stream) {
  NativeFileGrantCommand command;
  command.operation = boundedToken(requireToken(stream), 64);
  command.purpose = boundedToken(requireToken(stream), 32);
  command.access = boundedToken(requireToken(stream), 32);
  command.kind = boundedToken(requireToken(stream), 32);
  command.grantId = boundedToken(requireToken(stream), kMaxGrantIdBytes);
  command.displayName = decodeTextToken(requireToken(stream), kMaxDisplayNameBytes);
  command.absolutePath = decodeTextToken(requireToken(stream), kMaxPathBytes);
  rejectExtraTokens(stream);
  return command;
}

std::string readSingleStateFile(const NativeFileGrantCommand& command, std::size_t maxBytes) {
  const auto tokens = stateFileTokens(command, maxBytes);
  if (tokens.size() != 1) {
    throw std::runtime_error("invalid_file_grant_state_file");
  }
  return tokens[0];
}

DualStateFile readDualStateFile(const NativeFileGrantCommand& command, std::size_t maxBytes) {
  const auto tokens = stateFileTokens(command, maxBytes);
  return {
    tokens[0],
    tokens.size() > 1 ? tokens[1] : "-"
  };
}

std::string fileGrantAppliedJson() {
  return "{\"applied\":true,\"status\":\"state-restored\"}";
}

} // namespace soundbridge::worker_file_grants
