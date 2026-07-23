#include "PlugRelay/Lv2HostWorkerSupport.h"

#include "PlugRelay/NativePlugin.h"

#include <algorithm>
#include <cmath>
#include <sstream>

namespace plugrelay::lv2_worker {

std::uint32_t boundedLatencySamples(double value) {
  if (!std::isfinite(value) || value <= 0.0) {
    return 0;
  }
  return static_cast<std::uint32_t>(
      std::clamp(std::llround(value), 0LL, static_cast<long long>(kMaxWorkerLatencySamples)));
}

std::string parameterIdForPort(const Lv2Port& port) {
  return port.symbol.empty() ? std::to_string(port.index) : port.symbol;
}

float plainValueForPort(const Lv2Port& port, double normalizedValue) {
  const auto range = static_cast<double>(port.maximum) - static_cast<double>(port.minimum);
  return quantizedPlainValueForPort(
      port,
      static_cast<double>(port.minimum) + range * std::clamp(normalizedValue, 0.0, 1.0),
      normalizedValue);
}

double normalizedValueForPort(const Lv2Port& port, float plainValue) {
  const auto minValue = static_cast<double>(port.minimum);
  const auto maxValue = static_cast<double>(port.maximum);
  if (std::abs(maxValue - minValue) < 0.000001) {
    return 0.0;
  }
  return std::clamp((static_cast<double>(plainValue) - minValue) / (maxValue - minValue), 0.0, 1.0);
}

double defaultNormalizedValueForPort(const Lv2Port& port) {
  return normalizedValueForPort(port, quantizedPlainValueForPort(port, port.defaultValue, defaultNormalizedHint(port)));
}

float quantizedPlainValueForPort(const Lv2Port& port, double plainValue, double normalizedHint) {
  const auto minValue = static_cast<double>(port.minimum);
  const auto maxValue = static_cast<double>(port.maximum);
  double value = std::clamp(plainValue, minValue, maxValue);
  if (port.isToggled) {
    value = std::clamp(normalizedHint, 0.0, 1.0) >= 0.5 ? maxValue : minValue;
  } else if (port.isInteger || port.isEnumeration) {
    value = std::round(value);
  }
  return static_cast<float>(std::clamp(value, minValue, maxValue));
}

double defaultNormalizedHint(const Lv2Port& port) {
  const auto minValue = static_cast<double>(port.minimum);
  const auto maxValue = static_cast<double>(port.maximum);
  if (std::abs(maxValue - minValue) < 0.000001) {
    return 0.0;
  }
  return std::clamp((static_cast<double>(port.defaultValue) - minValue) / (maxValue - minValue), 0.0, 1.0);
}

std::uint32_t stepCountForPort(const Lv2Port& port) {
  if (port.isToggled) {
    return 1;
  }
  if (!port.isInteger && !port.isEnumeration) {
    return 0;
  }
  const auto minStep = static_cast<long long>(std::ceil(static_cast<double>(port.minimum)));
  const auto maxStep = static_cast<long long>(std::floor(static_cast<double>(port.maximum)));
  if (maxStep <= minStep) {
    return 0;
  }
  return static_cast<std::uint32_t>(
      std::min<long long>(maxStep - minStep, static_cast<long long>(kMaxWorkerParameterStepCount)));
}

std::string parameterInfoToJson(const Lv2Port& port, float plainValue) {
  std::ostringstream output;
  output << "{\"id\":\"" << jsonEscape(parameterIdForPort(port)) << "\""
         << ",\"name\":\"" << jsonEscape(port.name.empty() ? parameterIdForPort(port) : port.name) << "\""
         << ",\"normalizedValue\":" << normalizedValueForPort(port, plainValue)
         << ",\"defaultNormalizedValue\":" << defaultNormalizedValueForPort(port)
         << ",\"plainValue\":" << plainValue
         << ",\"minPlain\":" << port.minimum
         << ",\"maxPlain\":" << port.maximum
         << ",\"automatable\":true"
         << ",\"stepCount\":" << stepCountForPort(port)
         << ",\"readOnly\":false"
         << "}";
  return output.str();
}

} // namespace plugrelay::lv2_worker
