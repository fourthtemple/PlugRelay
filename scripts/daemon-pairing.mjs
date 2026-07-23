import crypto from "node:crypto";

export function createDaemonPairing({
  allowedOrigins,
  cleanupExpiredSessions,
  makeProtocolError,
  maxPairAttemptsPerConnection,
  maxSessionsPerOrigin,
  maxTotalSessions,
  pairingToken,
  sessionTtlMs,
  sessions,
  sessionsForOrigin,
  tokenEquals
}) {
  function createConnectionContext({ requestOrigin, terminate }) {
    return {
      connectionId: crypto.randomUUID(),
      requestOrigin,
      sessionTokens: new Set(),
      pairFailures: 0,
      terminate
    };
  }

  function pair(payload, context) {
    cleanupExpiredSessions();
    if (context.pairFailures >= maxPairAttemptsPerConnection) {
      throw makeProtocolError("pairing_locked", "Too many failed pairing attempts on this connection.");
    }
    const requestedOrigin = String(payload.origin ?? context.requestOrigin);
    if (context.requestOrigin === "unknown-origin") {
      throw makeProtocolError("origin_required", "Pairing requires a WebSocket Origin header.");
    }
    if (!tokenEquals(payload.pairingToken, pairingToken)) {
      context.pairFailures += 1;
      if (context.pairFailures >= maxPairAttemptsPerConnection) {
        context.terminate?.();
      }
      throw makeProtocolError("pairing_denied", "Invalid pairing token.");
    }

    if (context.requestOrigin !== "unknown-origin" && requestedOrigin !== context.requestOrigin) {
      throw makeProtocolError("origin_mismatch", "Pairing origin does not match the WebSocket Origin header.");
    }

    if (allowedOrigins.length > 0 && !allowedOrigins.includes(requestedOrigin)) {
      throw makeProtocolError("origin_not_allowed", "This browser origin is not allowed to pair with PlugRelay.", {
        origin: requestedOrigin
      });
    }

    if (sessionsForOrigin(requestedOrigin).length >= maxSessionsPerOrigin) {
      throw makeProtocolError("quota_exceeded", "Too many active PlugRelay sessions for this origin.", {
        origin: requestedOrigin,
        maxSessionsPerOrigin
      });
    }

    if (sessions.size >= maxTotalSessions) {
      throw makeProtocolError("quota_exceeded", "The local PlugRelay daemon has reached its total session limit.", {
        maxTotalSessions
      });
    }

    const sessionToken = crypto.randomBytes(24).toString("base64url");
    const expiresAt = Date.now() + sessionTtlMs;
    sessions.set(sessionToken, {
      sessionToken,
      origin: requestedOrigin,
      connectionId: context.connectionId,
      expiresAt,
      instances: new Set(),
      editors: new Set(),
      fileGrants: new Set(),
      createdAt: Date.now(),
      lastSeenAt: Date.now()
    });
    context.sessionTokens.add(sessionToken);

    return {
      sessionToken,
      expiresAt
    };
  }

  return {
    createConnectionContext,
    pair
  };
}
