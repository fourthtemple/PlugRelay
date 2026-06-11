import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REAL_ROOT = fs.realpathSync(ROOT);
const HOST = process.env.SOUNDBRIDGE_DEMO_HOST ?? "127.0.0.1";
const PORT = Number(process.env.SOUNDBRIDGE_DEMO_PORT ?? 5173);
const SERVED_PREFIXES = [
  path.join(REAL_ROOT, "examples/browser-demo") + path.sep,
  path.join(REAL_ROOT, "packages/web-client/dist") + path.sep
];

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".svg", "image/svg+xml"]
]);

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${HOST}:${PORT}`}`);
  let pathname;
  try {
    pathname = url.pathname === "/" ? "/examples/browser-demo/index.html" : decodeURIComponent(url.pathname);
  } catch {
    writeText(response, 400, "Bad request");
    return;
  }
  const absolute = path.resolve(ROOT, `.${pathname}`);

  if (!absolute.startsWith(`${ROOT}${path.sep}`) && absolute !== ROOT) {
    writeText(response, 403, "Forbidden");
    return;
  }

  fs.realpath(absolute, (realpathError, realAbsolute) => {
    if (realpathError || !isServedPath(realAbsolute)) {
      writeText(response, realpathError ? 404 : 403, realpathError ? "Not found" : "Forbidden");
      return;
    }

    fs.stat(realAbsolute, (statError, stats) => {
      if (statError || !stats.isFile()) {
        writeText(response, 404, "Not found");
        return;
      }

      const extension = path.extname(realAbsolute);
      response.writeHead(200, {
        "Content-Type": mimeTypes.get(extension) ?? "application/octet-stream",
        "Cache-Control": "no-store",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      });
      fs.createReadStream(realAbsolute).pipe(response);
    });
  });
});

assertLoopbackHost(HOST, "SOUNDBRIDGE_DEMO_HOST", "SOUNDBRIDGE_DEMO_ALLOW_NON_LOOPBACK");

server.listen(PORT, HOST, () => {
  console.log(`SoundBridge browser demo listening on http://${HOST}:${PORT}`);
});

function isServedPath(absolute) {
  if (!absolute.startsWith(`${REAL_ROOT}${path.sep}`)) {
    return false;
  }
  const relativeParts = path.relative(REAL_ROOT, absolute).split(path.sep);
  if (relativeParts.some((part) => part.startsWith("."))) {
    return false;
  }
  return SERVED_PREFIXES.some((prefix) => absolute.startsWith(prefix));
}

function assertLoopbackHost(host, hostEnvName, allowEnvName) {
  if (isLoopbackHost(host) || process.env[allowEnvName] === "1") {
    return;
  }

  console.error(
    `${hostEnvName}=${host} would expose the SoundBridge demo off this machine. ` +
      `Use 127.0.0.1, localhost, or ::1, or set ${allowEnvName}=1 if you are intentionally testing a non-loopback bind.`
  );
  process.exit(1);
}

function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function writeText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(body);
}
