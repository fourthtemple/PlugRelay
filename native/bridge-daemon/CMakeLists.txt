cmake_minimum_required(VERSION 3.20)

project(PlugRelayDaemon VERSION 0.1.0 LANGUAGES CXX)

add_executable(plugrelay-daemon
  src/main.cpp
  src/AudioUnitHostedEffect.cpp
  src/AudioUnitHostWorker.cpp
  src/AudioUnitHostWorkerSupport.cpp
  src/AudioUnitScanner.cpp
  src/Base64.cpp
  src/ExampleInstrumentRenderer.cpp
  src/Lv2AtomSupport.cpp
  src/Lv2BusSupport.cpp
  src/Lv2HostedPlugin.cpp
  src/Lv2HostedPluginStateSupport.cpp
  src/Lv2HostWorker.cpp
  src/Lv2HostWorkerSupport.cpp
  src/Lv2MetadataSupport.cpp
  src/Lv2ParameterSupport.cpp
  src/Lv2StateSupport.cpp
  src/Lv2TurtleMetadataSupport.cpp
  src/Lv2WorkerSupport.cpp
  src/Lv2Scanner.cpp
  src/NativePlugin.cpp
  src/NativeAudioJson.cpp
  src/NativeFileGrantSupport.cpp
  src/PluginCatalog.cpp
  src/Vst3BusLayoutSupport.cpp
  src/Vst3Scanner.cpp
  src/Vst3Host.cpp
  src/Vst3HostedEffect.cpp
  src/Vst3HostWorker.cpp
  src/Vst3HostInfoSupport.cpp
  src/Vst3HostWorkerProcessSupport.cpp
  src/Vst3HostWorkerSupport.cpp
  src/Vst3PluginMetadataSupport.cpp
  src/Vst3ProgramDataSupport.cpp
  src/Vst3StateSupport.cpp
  src/Vst3StreamSupport.cpp
)

add_executable(plugrelay-example-instrument
  src/ExampleInstrumentBundleMain.cpp
  src/ExampleInstrumentRenderer.cpp
)

add_library(plugrelay-example-lv2-gain MODULE
  src/ExampleLv2GainPlugin.cpp
)

target_compile_features(plugrelay-daemon PRIVATE cxx_std_17)
target_compile_features(plugrelay-example-instrument PRIVATE cxx_std_17)
target_compile_features(plugrelay-example-lv2-gain PRIVATE cxx_std_17)
target_include_directories(plugrelay-daemon PRIVATE include)
target_include_directories(plugrelay-example-instrument PRIVATE include)
target_include_directories(plugrelay-example-lv2-gain PRIVATE include)
set_target_properties(plugrelay-example-lv2-gain PROPERTIES
  PREFIX ""
  OUTPUT_NAME "plugrelay-example-lv2-gain"
  SUFFIX ".so"
)
target_compile_definitions(plugrelay-daemon PRIVATE
  PLUGRELAY_VERSION="${PROJECT_VERSION}"
  PLUGRELAY_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../.."
)
target_link_libraries(plugrelay-daemon PRIVATE ${CMAKE_DL_LIBS})

if(APPLE)
  target_compile_definitions(plugrelay-daemon PRIVATE PLUGRELAY_MACOS=1)
  target_link_libraries(plugrelay-daemon PRIVATE
    "-framework AudioToolbox"
    "-framework CoreFoundation"
  )
endif()

set(PLUGRELAY_VST3_SDK_PATH "$ENV{PLUGRELAY_VST3_SDK_PATH}" CACHE PATH "Path to Steinberg VST3 SDK")
if(NOT PLUGRELAY_VST3_SDK_PATH AND EXISTS "/Users/sethtenenbaum/wadspa/adlplug/thirdparty/vst3sdk/pluginterfaces/vst/ivstaudioprocessor.h")
  set(PLUGRELAY_VST3_SDK_PATH "/Users/sethtenenbaum/wadspa/adlplug/thirdparty/vst3sdk" CACHE PATH "Path to Steinberg VST3 SDK" FORCE)
endif()

if(APPLE AND PLUGRELAY_VST3_SDK_PATH AND EXISTS "${PLUGRELAY_VST3_SDK_PATH}/pluginterfaces/vst/ivstaudioprocessor.h")
  enable_language(OBJCXX)
  target_compile_definitions(plugrelay-daemon PRIVATE
    RELEASE=1
    PLUGRELAY_ENABLE_VST3_SDK=1
  )
  target_include_directories(plugrelay-daemon PRIVATE "${PLUGRELAY_VST3_SDK_PATH}")
  target_sources(plugrelay-daemon PRIVATE
    "${PLUGRELAY_VST3_SDK_PATH}/base/source/baseiids.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/base/source/fbuffer.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/base/source/fdebug.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/base/source/fobject.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/base/source/fstring.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/base/source/updatehandler.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/base/thread/source/flock.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/pluginterfaces/base/conststringtable.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/pluginterfaces/base/coreiids.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/pluginterfaces/base/funknown.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/pluginterfaces/base/ustring.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/public.sdk/source/common/memorystream.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/public.sdk/source/main/pluginfactoryvst3.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/public.sdk/source/vst/hosting/eventlist.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/public.sdk/source/vst/hosting/hostclasses.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/public.sdk/source/vst/hosting/module.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/public.sdk/source/vst/hosting/module_mac.mm"
    "${PLUGRELAY_VST3_SDK_PATH}/public.sdk/source/vst/hosting/parameterchanges.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/public.sdk/source/vst/hosting/stringconvert.cpp"
    "${PLUGRELAY_VST3_SDK_PATH}/public.sdk/source/vst/vstinitiids.cpp"
  )
  target_link_libraries(plugrelay-daemon PRIVATE
    "-framework Cocoa"
  )
endif()

set(PLUGRELAY_EXAMPLE_VST3_EXECUTABLE
  "${CMAKE_CURRENT_SOURCE_DIR}/../example-plugins/VST3/plugrelay-example-polysynth.vst3/Contents/MacOS/plugrelay-example-polysynth"
)
set(PLUGRELAY_EXAMPLE_AU_EXECUTABLE
  "${CMAKE_CURRENT_SOURCE_DIR}/../example-plugins/Components/plugrelay-example-tonewheel.component/Contents/MacOS/plugrelay-example-tonewheel"
)
set(PLUGRELAY_EXAMPLE_LV2_EXECUTABLE
  "${CMAKE_CURRENT_SOURCE_DIR}/../example-plugins/LV2/plugrelay-example-wavefold.lv2/plugrelay-example-wavefold"
)
set(PLUGRELAY_EXAMPLE_LV2_GAIN_MODULE
  "${CMAKE_CURRENT_SOURCE_DIR}/../example-plugins/LV2/plugrelay-example-gain.lv2/plugrelay-example-lv2-gain.so"
)
set(PLUGRELAY_BLOCK_PROFILE_LV2_GAIN_MODULE
  "${CMAKE_CURRENT_SOURCE_DIR}/../example-plugins/LV2/plugrelay-block-profile-gain.lv2/plugrelay-example-lv2-gain.so"
)

add_custom_command(TARGET plugrelay-example-instrument POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory "$<SHELL_PATH:${CMAKE_CURRENT_SOURCE_DIR}/../example-plugins/VST3/plugrelay-example-polysynth.vst3/Contents/MacOS>"
  COMMAND ${CMAKE_COMMAND} -E make_directory "$<SHELL_PATH:${CMAKE_CURRENT_SOURCE_DIR}/../example-plugins/Components/plugrelay-example-tonewheel.component/Contents/MacOS>"
  COMMAND ${CMAKE_COMMAND} -E make_directory "$<SHELL_PATH:${CMAKE_CURRENT_SOURCE_DIR}/../example-plugins/LV2/plugrelay-example-wavefold.lv2>"
  COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:plugrelay-example-instrument>" "$<SHELL_PATH:${PLUGRELAY_EXAMPLE_VST3_EXECUTABLE}>"
  COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:plugrelay-example-instrument>" "$<SHELL_PATH:${PLUGRELAY_EXAMPLE_AU_EXECUTABLE}>"
  COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:plugrelay-example-instrument>" "$<SHELL_PATH:${PLUGRELAY_EXAMPLE_LV2_EXECUTABLE}>"
  COMMENT "Installing PlugRelay example instrument executables into repo-local AU/VST/LV2 bundles"
)

add_custom_command(TARGET plugrelay-example-lv2-gain POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory "$<SHELL_PATH:${CMAKE_CURRENT_SOURCE_DIR}/../example-plugins/LV2/plugrelay-example-gain.lv2>"
  COMMAND ${CMAKE_COMMAND} -E make_directory "$<SHELL_PATH:${CMAKE_CURRENT_SOURCE_DIR}/../example-plugins/LV2/plugrelay-block-profile-gain.lv2>"
  COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:plugrelay-example-lv2-gain>" "$<SHELL_PATH:${PLUGRELAY_EXAMPLE_LV2_GAIN_MODULE}>"
  COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:plugrelay-example-lv2-gain>" "$<SHELL_PATH:${PLUGRELAY_BLOCK_PROFILE_LV2_GAIN_MODULE}>"
  COMMENT "Installing PlugRelay LV2 gain fixture into repo-local LV2 bundle"
)
