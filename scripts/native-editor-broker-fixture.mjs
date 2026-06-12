const mode = process.argv[2] ?? "ok";

if (mode === "bad-ready") {
  process.stdout.write(`${JSON.stringify({ ok: false, ready: true })}\n`);
} else if (mode === "malformed-ready") {
  process.stdout.write("{not-json\n");
} else if (mode === "ready-timeout") {
  setInterval(() => {}, 1000);
} else {
  process.stdout.write(`${JSON.stringify({ ok: true, ready: true })}\n`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf("\n");
    if (newline < 0) {
      return;
    }
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) {
      continue;
    }
    const message = JSON.parse(line);
    if (message.command === "openEditor") {
      if (mode === "open-timeout") {
        continue;
      }
      if (mode === "open-error") {
        process.stdout.write(`${JSON.stringify({ error: "fixture_open_failed" })}\n`);
        continue;
      }
      if (mode === "malformed-open") {
        process.stdout.write("{not-json\n");
        continue;
      }
      if (mode === "oversized-open") {
        process.stdout.write(`${"x".repeat(4096)}\n`);
        continue;
      }
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          brokerSessionId: `fixture-${message.editorId}`,
          capabilities: {
            nativeWindow: true,
            parameterEditing: false,
            fileDialogs: false,
            clipboard: false,
            dragAndDrop: false
          }
        })}\n`
      );
    } else if (message.command === "closeEditor") {
      process.stdout.write(`${JSON.stringify({ ok: true, closed: true })}\n`);
    } else if (message.command === "quit") {
      process.exit(0);
    } else {
      process.stdout.write(`${JSON.stringify({ error: "unknown_command" })}\n`);
    }
  }
});
