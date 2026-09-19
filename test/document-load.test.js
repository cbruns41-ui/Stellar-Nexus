"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const express = require("express");
const { applySecurityHeaders } = require("../src/auth");
const { createHttpServer, skipSafeMethods } = require("../src/httpServer");

function listen(app) {
  const server = createHttpServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function rawRequest(port, payload) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, "127.0.0.1", () => sock.write(payload));
    let data = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
    });
    sock.on("error", reject);
    sock.on("end", () => resolve(data.toString("latin1")));
    setTimeout(() => {
      try {
        sock.end();
      } catch {
        /* ignore */
      }
    }, 400);
    setTimeout(() => {
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      resolve(data.toString("latin1"));
    }, 1500);
  });
}

function gameApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(applySecurityHeaders);
  app.use(skipSafeMethods(express.json({ limit: "700kb" })));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });
  return app;
}

const chromeHeaders = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "de-DE,de;q=0.9",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-User": "?1",
  "Sec-Fetch-Dest": "document",
  "sec-ch-ua": '"Google Chrome";v="140", "Chromium";v="140", "Not=A?Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  Priority: "u=0, i",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

test("Chrome document GET / returns 200 HTML like curl", async (t) => {
  const server = await listen(gameApp());
  t.after(() => new Promise((r) => server.close(r)));
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/`, { headers: chromeHeaders });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);
  const html = await res.text();
  assert.match(html, /Stellar Nexus/);
  assert.match(html, /<!DOCTYPE html>/i);
});

test("parser rejections return a 400 body with the reason instead of an empty response", async (t) => {
  const server = await listen(gameApp());
  t.after(() => new Promise((r) => server.close(r)));
  const port = server.address().port;
  const body = await rawRequest(
    port,
    "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n:method: GET\r\n\r\n"
  );
  assert.match(body, /^HTTP\/1\.1 400 Bad Request/);
  assert.match(body, /Stellar Nexus hat die HTTP-Anfrage abgelehnt/);
  assert.match(body, /HPE_/);
});

test("TLS bytes on the HTTP port are closed without an HTTP 400 that Chrome would surface", async (t) => {
  const server = await listen(gameApp());
  t.after(() => new Promise((r) => server.close(r)));
  const port = server.address().port;
  const hello = Buffer.from([0x16, 0x03, 0x01, 0x00, 0x04, 0x01, 0x00, 0x00, 0x00]);
  const reply = await new Promise((resolve, reject) => {
    const sock = net.connect(port, "127.0.0.1", () => sock.write(hello));
    let data = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
    });
    sock.on("error", () => resolve(data));
    sock.on("close", () => resolve(data));
    sock.on("end", () => resolve(data));
    setTimeout(() => {
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      resolve(data);
    }, 800);
  });
  assert.equal(reply.toString("latin1").startsWith("HTTP/1.1 400"), false, reply.toString("latin1").slice(0, 80));
});

test("oversized Cookie that used to 431 at 16 KB is accepted", async (t) => {
  const server = await listen(gameApp());
  t.after(() => new Promise((r) => server.close(r)));
  const port = server.address().port;
  const cookie = "sn_session=abc; x=" + "a".repeat(20000);
  const res = await fetch(`http://127.0.0.1:${port}/`, { headers: { ...chromeHeaders, cookie } });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Stellar Nexus/);
});
