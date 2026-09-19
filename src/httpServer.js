"use strict";

const http = require("node:http");

const MAX_HEADER_SIZE = 64 * 1024;

function packetSnippet(buf) {
  if (!buf || !buf.length) return "";
  if (isTlsHandshake(buf)) return "<tls-handshake>";
  return buf
    .toString("latin1")
    .slice(0, 400)
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function isTlsHandshake(buf) {
  return Boolean(buf && buf.length >= 3 && buf[0] === 0x16 && buf[1] === 0x03);
}

function handleClientError(err, socket) {
  const raw = err.rawPacket;
  const code = err.code || "HPE_UNKNOWN";
  console.error(`[http] clientError ${code} ${err.message || ""} ${packetSnippet(raw)}`);
  if (!socket || !socket.writable) return;
  try {
    if (isTlsHandshake(raw)) {
      socket.destroy();
      return;
    }
    const overflow = code === "HPE_HEADER_OVERFLOW";
    const status = overflow ? 431 : 400;
    const label = overflow ? "Request Header Fields Too Large" : "Bad Request";
    const body =
      `Stellar Nexus hat die HTTP-Anfrage abgelehnt (${code}): ${err.message || label}.\n` +
      "Document-GET braucht HTTP/1.1 mit einem Host-Header.\n";
    const payload = Buffer.from(body);
    const head = Buffer.from(
      `HTTP/1.1 ${status} ${label}\r\n` +
        "Content-Type: text/plain; charset=utf-8\r\n" +
        "Connection: close\r\n" +
        `Content-Length: ${payload.length}\r\n` +
        "\r\n"
    );
    socket.end(Buffer.concat([head, payload]));
  } catch {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  }
}

function requestLog(req, res, next) {
  const started = Date.now();
  res.on("finish", () => {
    const dest = String(req.headers["sec-fetch-dest"] || "");
    const path = req.path || req.url || "";
    if (path !== "/" && dest !== "document" && res.statusCode < 400) return;
    const cookie = req.headers.cookie;
    console.log(
      `[http] ${res.statusCode} ${req.method} ${req.originalUrl || req.url} host=${req.headers.host || "-"} origin=${req.headers.origin || "-"} dest=${dest || "-"} http/${req.httpVersion} cookieB=${cookie ? Buffer.byteLength(cookie) : 0} ua=${String(req.headers["user-agent"] || "-").slice(0, 96)} ${Date.now() - started}ms`
    );
  });
  next();
}

function skipSafeMethods(parser) {
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") return next();
    return parser(req, res, next);
  };
}

function createHttpServer(app) {
  const server = http.createServer(
    {
      maxHeaderSize: MAX_HEADER_SIZE,
      joinDuplicateHeaders: true,
    },
    app
  );
  server.on("clientError", handleClientError);
  return server;
}

module.exports = {
  MAX_HEADER_SIZE,
  createHttpServer,
  handleClientError,
  isTlsHandshake,
  requestLog,
  skipSafeMethods,
};
