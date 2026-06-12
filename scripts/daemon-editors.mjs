import crypto from "node:crypto";

export function createDaemonEditors({
  clonePluginMetadata,
  cleanupExpiredEditors,
  destroyEditorRecord,
  editors,
  formatCategory,
  getInstance,
  limits,
  makeProtocolError,
  nativeEditorBroker,
  resolvePlugin
}) {
  async function openEditor(payload, session) {
    cleanupExpiredEditors();
    const instance = getInstance(payload.instanceId, session);
    const mode = payload.mode == null ? "generic" : String(payload.mode);
    if (mode !== "generic" && mode !== "native") {
      throw makeProtocolError("invalid_argument", "openEditor.mode must be generic or native.");
    }

    if (session.editors.size >= limits.maxEditorsPerSession) {
      throw makeProtocolError("quota_exceeded", "This browser session has reached its editor session limit.", {
        maxEditorsPerSession: limits.maxEditorsPerSession
      });
    }
    if (editors.size >= limits.maxTotalEditors) {
      throw makeProtocolError(
        "quota_exceeded",
        "The local SoundBridge daemon has reached its total editor session limit.",
        {
          maxTotalEditors: limits.maxTotalEditors
        }
      );
    }

    if (mode === "native") {
      return openNativeEditor(instance, session);
    }
    return openGenericEditor(instance, session);
  }

  function openGenericEditor(instance, session) {
    const editorId = `editor-${crypto.randomUUID()}`;
    const expiresAt = Math.min(Date.now() + limits.editorSessionTtlMs, session.expiresAt);
    const editor = {
      editorId,
      instanceId: instance.instanceId,
      ownerSessionToken: session.sessionToken,
      ownerOrigin: session.origin,
      kind: "generic-parameters",
      native: false,
      transport: "web",
      createdAt: Date.now(),
      expiresAt,
      capabilities: {
        parameterEditing: true,
        nativeWindow: false,
        fileDialogs: false,
        clipboard: false,
        dragAndDrop: false
      }
    };
    editors.set(editorId, editor);
    session.editors.add(editorId);

    return editorResponse(editor, instance);
  }

  async function openNativeEditor(instance, session) {
    if (!nativeEditorBroker?.available) {
      throw makeProtocolError("unsupported_command", "Native plugin editors require a configured UI broker process.");
    }
    if (!instance.nativeHost) {
      throw makeProtocolError("unsupported_command", "Native plugin editors require an installed native plugin instance.");
    }

    const editorId = `editor-${crypto.randomUUID()}`;
    const expiresAt = Math.min(Date.now() + limits.editorSessionTtlMs, session.expiresAt);
    const editor = {
      editorId,
      instanceId: instance.instanceId,
      ownerSessionToken: session.sessionToken,
      ownerOrigin: session.origin,
      kind: "native-window",
      native: true,
      transport: "native-broker",
      createdAt: Date.now(),
      expiresAt,
      capabilities: {
        parameterEditing: false,
        nativeWindow: true,
        fileDialogs: false,
        clipboard: false,
        dragAndDrop: false
      }
    };

    try {
      const opened = await nativeEditorBroker.openEditor({ editor, instance });
      editor.brokerSessionId = opened.brokerSessionId;
      editor.capabilities = opened.capabilities;
      editor.close = () => opened.brokerSession?.close(editor.editorId);
    } catch {
      throw makeProtocolError("editor_broker_failed", "Native plugin editor broker failed to open this editor.");
    }

    editors.set(editorId, editor);
    session.editors.add(editorId);
    return editorResponse(editor, instance);
  }

  function closeEditor(editorId, session) {
    const editor = getEditor(editorId, session);
    destroyEditorRecord(editor);
    return {
      closed: true,
      editorId: editor.editorId
    };
  }

  function getEditor(editorId, session) {
    cleanupExpiredEditors();
    const safeEditorId = String(editorId ?? "");
    const editor = editors.get(safeEditorId);
    if (!editor) {
      throw makeProtocolError("editor_not_found", `Unknown editor: ${safeEditorId}`);
    }
    if (session && editor.ownerSessionToken !== session.sessionToken) {
      throw makeProtocolError("editor_access_denied", "This editor session belongs to a different browser session.", {
        editorId: safeEditorId,
        requestOrigin: session.origin
      });
    }
    return editor;
  }

  function editorResponse(editor, instance) {
    const plugin = resolvePlugin(instance.pluginId) ?? {};
    return {
      editorId: editor.editorId,
      instanceId: editor.instanceId,
      kind: editor.kind,
      native: editor.native,
      transport: editor.transport,
      expiresAt: editor.expiresAt,
      plugin: clonePluginMetadata({
        ...plugin,
        pluginId: plugin.pluginId ?? instance.pluginId,
        format: instance.format,
        name: plugin.name ?? instance.pluginId,
        vendor: plugin.vendor ?? "Unknown",
        category: plugin.category ?? formatCategory(instance.format),
        kind: instance.kind,
        source: instance.source ?? plugin.source,
        inputs: instance.inputChannels,
        outputs: instance.outputChannels,
        parameters: instance.parameters,
        hostable: true
      }),
      parameters: instance.parameters.map((parameter) => ({ ...parameter })),
      capabilities: { ...editor.capabilities }
    };
  }

  return {
    closeEditor,
    openEditor
  };
}
