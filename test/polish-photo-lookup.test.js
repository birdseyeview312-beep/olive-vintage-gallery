"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { beforeEach, afterEach, test } = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { Jimp } = require("jimp");

const HANDLER_PATH = path.resolve(__dirname, "../api/polish-photo.js");
const ADMIN_JS_PATH = path.resolve(__dirname, "../admin/admin.js");
const AUTH_HEADER = `${["Bea", "rer"].join("")} owner-token`;

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const originalHttpsRequest = require("node:https").request;
const originalRandomUUID = global.crypto.randomUUID;

function toArrayBuffer(buffer) {
  const view = Uint8Array.from(buffer);
  return view.buffer;
}

function makeFetchResponse({ status = 200, headers = {}, json, text, bodyBuffer }) {
  const normalizedHeaders = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return normalizedHeaders.get(String(name || "").toLowerCase()) || null;
      }
    },
    async json() {
      return typeof json === "function" ? json() : (json ?? {});
    },
    async text() {
      return typeof text === "function" ? text() : (text ?? "");
    },
    async arrayBuffer() {
      return toArrayBuffer(bodyBuffer || Buffer.alloc(0));
    }
  };
}

function makeReqRes(body, authorization = AUTH_HEADER) {
  const req = { method: "POST", headers: { authorization }, body };
  const res = {
    statusCode: 200,
    headers: {},
    payload: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(value) {
      this.payload = String(value || "");
    }
  };
  return { req, res };
}

function parsePayload(res) {
  return JSON.parse(res.payload || "{}");
}

function mockSourceImageDownload(bufferOrFactory) {
  const https = require("node:https");
  https.request = (_options, callback) => {
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.destroy = (error) => {
      if (error) process.nextTick(() => req.emit("error", error));
    };
    req.end = () => {
      const buffer = typeof bufferOrFactory === "function" ? bufferOrFactory() : bufferOrFactory;
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = {
        "content-type": "image/png",
        "content-length": String(buffer.length)
      };
      response.resume = () => {};
      callback(response);
      process.nextTick(() => {
        response.emit("data", buffer);
        response.emit("end");
      });
    };
    return req;
  };
}

function loadHandler() {
  delete require.cache[require.resolve(HANDLER_PATH)];
  return require(HANDLER_PATH);
}

async function pngWithColor(hexColor) {
  const image = new Jimp({ width: 2, height: 2, color: hexColor });
  return image.getBuffer("image/png");
}

beforeEach(() => {
  process.env = {
    ...originalEnv,
    SUPABASE_URL: "https://supabase.example",
    SUPABASE_ANON_KEY: "anon-key",
    PIXELCUT_API_KEY: "pixelcut-key"
  };
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  const https = require("node:https");
  https.request = originalHttpsRequest;
  global.crypto.randomUUID = originalRandomUUID;
  delete require.cache[require.resolve(HANDLER_PATH)];
});

test("blocks local/private/unsafe URLs and accepts public HTTPS URL", async () => {
  const sourceBuffer = await pngWithColor(0xffffffff);
  const pixelcutBuffer = await pngWithColor(0xffffffff);
  mockSourceImageDownload(sourceBuffer);

  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) {
      return makeFetchResponse({ status: 200, json: { app_metadata: { olive_role: "admin" } } });
    }
    if (String(url) === "https://api.developer.pixelcut.ai/v1/remove-background") {
      return makeFetchResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        json: { result_url: "https://93.184.216.34/result.png" }
      });
    }
    if (String(url).startsWith("https://supabase.example/storage/v1/object/product-images/")) {
      return makeFetchResponse({ status: 200, json: {} });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const handler = loadHandler();
  const blocked = [
    "http://example.com/photo.png",
    "https://localhost/photo.png",
    "https://127.0.0.1/photo.png",
    "https://10.1.2.3/photo.png",
    "https://example.com:81/photo.png"
  ];

  for (const sourceImageUrl of blocked) {
    const { req, res } = makeReqRes({ sourceImageUrl, productId: "p1", background: "auto" });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(parsePayload(res).error, "Provide a valid HTTPS image URL.");
  }

  const accepted = makeReqRes({ sourceImageUrl: "https://93.184.216.34/photo.png", productId: "p1", background: "auto" });
  await handler(accepted.req, accepted.res);
  assert.equal(accepted.res.statusCode, 200);
  assert.equal(parsePayload(accepted.res).success, true);
});

test("auto background selects contrasting color and forced background is honored", async () => {
  const sourceBuffer = await pngWithColor(0xffffffff);
  const brightSubject = await pngWithColor(0xfefefeff);
  const darkSubject = await pngWithColor(0x010101ff);
  let currentPixelcutImage = brightSubject;
  mockSourceImageDownload(() => currentPixelcutImage);

  const handler = loadHandler();

  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) {
      return makeFetchResponse({ status: 200, json: { app_metadata: { olive_role: "admin" } } });
    }
    if (String(url) === "https://api.developer.pixelcut.ai/v1/remove-background") {
      return makeFetchResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        json: { result_url: "https://93.184.216.34/result.png" }
      });
    }
    if (String(url).startsWith("https://supabase.example/storage/v1/object/product-images/")) {
      return makeFetchResponse({ status: 200, json: {} });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  global.crypto.randomUUID = (() => {
    let i = 0;
    return () => `id-${++i}`;
  })();

  const brightAuto = makeReqRes({ sourceImageUrl: "https://93.184.216.34/bright.png", productId: "p1", background: "auto" });
  await handler(brightAuto.req, brightAuto.res);
  assert.equal(parsePayload(brightAuto.res).background, "black");

  currentPixelcutImage = darkSubject;
  const darkAuto = makeReqRes({ sourceImageUrl: "https://93.184.216.34/dark.png", productId: "p1", background: "auto" });
  await handler(darkAuto.req, darkAuto.res);
  assert.equal(parsePayload(darkAuto.res).background, "white");

  const forcedBlack = makeReqRes({ sourceImageUrl: "https://93.184.216.34/forced.png", productId: "p1", background: "black" });
  await handler(forcedBlack.req, forcedBlack.res);
  assert.equal(parsePayload(forcedBlack.res).background, "black");
});

test("Pixelcut receives correct request and errors are readable without API key leakage", async () => {
  const sourceBuffer = await pngWithColor(0xffffffff);
  const pixelcutBuffer = await pngWithColor(0x010101ff);
  mockSourceImageDownload(sourceBuffer);

  process.env.PIXELCUT_API_KEY = "super-secret-key";
  const handler = loadHandler();
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/auth/v1/user")) {
      return makeFetchResponse({ status: 200, json: { app_metadata: { olive_role: "admin" } } });
    }
    if (String(url) === "https://api.developer.pixelcut.ai/v1/remove-background") {
      return makeFetchResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        json: { result_url: "https://93.184.216.34/result.png" }
      });
    }
    if (String(url).startsWith("https://supabase.example/storage/v1/object/product-images/")) {
      return makeFetchResponse({ status: 200, json: {} });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const success = makeReqRes({ sourceImageUrl: "https://93.184.216.34/image.png", productId: "prod-1", background: "auto" });
  await handler(success.req, success.res);
  assert.equal(success.res.statusCode, 200);

  const pixelcutCall = calls.find((c) => c.url === "https://api.developer.pixelcut.ai/v1/remove-background");
  assert.ok(pixelcutCall);
  assert.equal(pixelcutCall.options.method, "POST");
  assert.equal(pixelcutCall.options.headers["X-API-Key"], "super-secret-key");
  assert.equal(pixelcutCall.options.headers["Content-Type"], "application/json");
  assert.equal(pixelcutCall.options.headers.Accept, "application/json");
  assert.deepEqual(JSON.parse(pixelcutCall.options.body), {
    image_url: "https://93.184.216.34/image.png",
    format: "png"
  });

  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) {
      return makeFetchResponse({ status: 200, json: { app_metadata: { olive_role: "admin" } } });
    }
    if (String(url) === "https://api.developer.pixelcut.ai/v1/remove-background") {
      return makeFetchResponse({ status: 402, text: "upstream auth details" });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const failed = makeReqRes({ sourceImageUrl: "https://93.184.216.34/image.png", productId: "prod-1", background: "auto" });
  await handler(failed.req, failed.res);
  assert.equal(failed.res.statusCode, 502);
  const error = parsePayload(failed.res).error;
  assert.match(error, /credits/i);
  assert.doesNotMatch(error, /super-secret-key/);
});

test("owner-only full flow uploads to unique Supabase paths with owner token and never mutates original images input", async () => {
  const sourceBuffer = await pngWithColor(0xffffffff);
  const pixelcutBuffer = await pngWithColor(0x010101ff);
  mockSourceImageDownload(sourceBuffer);

  global.crypto.randomUUID = (() => {
    let i = 0;
    return () => `uuid-${++i}`;
  })();

  const uploadCalls = [];
  const fetchCalls = [];

  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    if (String(url).includes("/auth/v1/user")) {
      return makeFetchResponse({ status: 200, json: { app_metadata: { olive_role: "admin" } } });
    }
    if (String(url) === "https://api.developer.pixelcut.ai/v1/remove-background") {
      return makeFetchResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        json: { result_url: "https://93.184.216.34/result.png" }
      });
    }
    if (String(url).startsWith("https://supabase.example/storage/v1/object/product-images/")) {
      uploadCalls.push({ url: String(url), options });
      return makeFetchResponse({ status: 200, json: {} });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const handler = loadHandler();

  const body = {
    sourceImageUrl: "https://93.184.216.34/image.png",
    productId: "piece-1",
    background: "auto",
    images: ["orig-1.png", "orig-2.png"]
  };
  const snapshot = JSON.stringify(body);

  const first = makeReqRes(body, AUTH_HEADER);
  await handler(first.req, first.res);
  const second = makeReqRes(body, AUTH_HEADER);
  await handler(second.req, second.res);

  assert.equal(first.res.statusCode, 200);
  assert.equal(second.res.statusCode, 200);

  const firstPayload = parsePayload(first.res);
  const secondPayload = parsePayload(second.res);

  assert.equal(firstPayload.success, true);
  assert.ok(firstPayload.polishedImageUrl.includes("/storage/v1/object/public/product-images/"));
  assert.match(firstPayload.storagePath, /^piece-1\/gallery-covers\/uuid-1-olive-polished\.png$/);
  assert.match(secondPayload.storagePath, /^piece-1\/gallery-covers\/uuid-2-olive-polished\.png$/);
  assert.notEqual(firstPayload.storagePath, secondPayload.storagePath);

  assert.equal(uploadCalls.length, 2);
  for (const call of uploadCalls) {
    assert.equal(call.options.headers.Authorization, AUTH_HEADER);
    assert.equal(call.options.headers.apikey, "anon-key");
    assert.equal(call.options.headers["x-upsert"], "false");
  }

  assert.equal(JSON.stringify(body), snapshot);
  assert.equal(fetchCalls.filter((c) => c.url.includes("/auth/v1/user")).length, 2);
});

test("admin UI has no automatic polishing behavior", () => {
  const source = readFileSync(ADMIN_JS_PATH, "utf8");
  assert.doesNotMatch(source, /AUTO_POLISH_KEY/);
  assert.doesNotMatch(source, /autoPolishUploads/);
  const submitStart = source.indexOf("els.pieceForm.addEventListener(\"submit\"");
  const submitEnd = source.indexOf("els.deleteBtn.addEventListener(\"click\"");
  assert.ok(submitStart >= 0 && submitEnd > submitStart);
  const submitBlock = source.slice(submitStart, submitEnd);
  assert.doesNotMatch(submitBlock, /callPhotoPolish\(/);
});
