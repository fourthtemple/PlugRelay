import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HOST = process.env.SOUNDBRIDGE_DEMO_HOST ?? "127.0.0.1";
const PORT = Number(process.env.SOUNDBRIDGE_DEMO_PORT ?? 5173);

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
  const pathname = url.pathname === "/" ? "/examples/browser-demo/index.html" : decodeURIComponent(url.pathname);
  const absolute = path.resolve(ROOT, `.${pathname}`);

  if (!absolute.startsWith(`${ROOT}${path.sep}`) && absolute !== ROOT) {
    writeText(response, 403, "Forbidden");
    return;
  }

  fs.stat(absolute, (statError, stats) => {
    if (statError || !stats.isFile()) {
      writeText(response, 404, "Not found");
      return;
    }

    const extension = path.extname(absolute);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(extension) ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    });
    fs.createReadStream(absolute).pipe(response);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`SoundBridge browser demo listening on http://${HOST}:${PORT}`);
});

function writeText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(body);
}
