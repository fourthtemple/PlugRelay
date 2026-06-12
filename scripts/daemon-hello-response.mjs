export function createDaemonHelloResponse({
  allowedOrigins,
  createPluginFormatCapabilities,
  fileGrantSupport,
  host,
  limits,
  nativeEditorBroker,
  nativeRenderer,
  port,
  protocolVersion,
  workerSecurityLimits
}) {
  return function helloResponse(paired) {
    return {
      name: "soundbridge-mock-daemon",
      protocolVersion,
      pairingRequired: true,
      transports: [
        {
          kind: "websocket",
          url: `ws://${host}:${port}/bridge`,
          audioEncoding: "json-float32-arrays"
        }
      ],
      capabilities: {
        pluginFormats: paired ? createPluginFormatCapabilities() : {},
        ...(paired ? pairedCapabilities({ fileGrantSupport, nativeEditorBroker, nativeRenderer }) : {}),
        security: securityCapabilities({
          allowedOrigins,
          fileGrantSupport,
          limits,
          nativeEditorBroker,
          workerSecurityLimits
        })
      }
    };
  };
}

function pairedCapabilities({ fileGrantSupport, nativeEditorBroker, nativeRenderer }) {
  return {
    vst3: true,
    au: true,
    lv2: true,
    mockPlugins: true,
    state: true,
    latency: true,
    tail: true,
    layout: true,
    midi: true,
    automation: true,
    transport: true,
    genericEditor: true,
    fileAccess: fileGrantSupport.browserPathGrantsAvailable() || fileGrantSupport.nativeApprovalAvailable(),
    fileGrantOperations: true,
    nativeExampleRenderer: Boolean(nativeRenderer),
    nativeEditor: Boolean(nativeEditorBroker?.available)
  };
}

function securityCapabilities({
  allowedOrigins,
  fileGrantSupport,
  limits,
  nativeEditorBroker,
  workerSecurityLimits
}) {
  return {
    originAllowlist: allowedOrigins.length > 0,
    sessionBoundToConnection: true,
    sessionBoundToOrigin: true,
    instanceOwnership: true,
    cleanupOnDisconnect: true,
    hostHeaderValidation: true,
    fileBroker: fileGrantSupport.available(),
    fileGrantApprovalBroker: fileGrantSupport.nativeApprovalAvailable(),
    browserFileGrantPaths: fileGrantSupport.browserPathGrantsAvailable(),
    nativeEditorBroker: Boolean(nativeEditorBroker?.available),
    nativeEditorFileDialogs: nativeEditorBroker?.capabilityPolicy?.fileDialogs === true,
    nativeEditorClipboard: nativeEditorBroker?.capabilityPolicy?.clipboard === true,
    nativeEditorDragAndDrop: nativeEditorBroker?.capabilityPolicy?.dragAndDrop === true,
    maxInstancesPerSession: limits.maxInstancesPerSession,
    maxTotalInstances: limits.maxTotalInstances,
    maxEditorsPerSession: limits.maxEditorsPerSession,
    maxTotalEditors: limits.maxTotalEditors,
    maxEditorSessionTtlMs: limits.editorSessionTtlMs,
    maxFileGrantsPerSession: limits.maxFileGrantsPerSession,
    maxFileGrantsPerInstance: limits.maxFileGrantsPerInstance,
    maxTotalFileGrants: limits.maxTotalFileGrants,
    maxFileGrantTtlMs: limits.fileGrantTtlMs,
    maxFileGrantPathBytes: limits.maxFileGrantPathBytes,
    maxFileGrantDisplayNameBytes: limits.maxFileGrantDisplayNameBytes,
    nativeWorkerFileGrants: true,
    maxTotalSessions: limits.maxTotalSessions,
    maxAudioChannels: limits.maxAudioChannels,
    maxBlockSize: limits.maxBlockSize,
    maxPluginNoteExpressions: limits.maxPluginNoteExpressions,
    maxPluginProgramDataBytes: limits.maxPluginProgramDataBytes,
    maxPluginProgramDataEnvelopeBytes: limits.maxPluginProgramDataEnvelopeBytes,
    maxPluginProgramLists: limits.maxPluginProgramLists,
    maxPluginPrograms: limits.maxPluginPrograms,
    maxNoteExpressionTextBytes: limits.maxNoteExpressionTextBytes,
    maxParameterEventsPerRequest: limits.maxParameterEventsPerRequest,
    maxAutomationCurvePoints: limits.maxAutomationCurvePoints,
    maxAutomationLanesPerInstance: limits.maxAutomationLanesPerInstance,
    maxAutomationLanePoints: limits.maxAutomationLanePoints,
    maxTransportTempoBpm: limits.maxTransportTempoBpm,
    maxTransportPositionMusic: limits.maxTransportPositionMusic,
    maxTransportSamplePosition: limits.maxTransportSamplePosition,
    ...workerSecurityLimits
  };
}
