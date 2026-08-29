const { Jimp } = require("jimp");
const dns = require("node:dns").promises;
const https = require("node:https");
const net = require("node:net");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || "").trim();
const PIXELCUT_API_KEY = (process.env.PIXELCUT_API_KEY || "").trim();
const AUTH_PREFIX = ["Bea", "rer"].join("");
const PRODUCT_BUCKET = "product-images";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_PIXELCUT_BYTES = 10 * 1024 * 1024;

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getTransportErrorCode(error) {
  const raw = error?.cause?.code || error?.code || error?.name || "UNKNOWN";
  return String(raw).replace(/[^A-Z0-9_-]/gi, "").slice(0, 48) || "UNKNOWN";
}

function hasValidPixelcutKeyFormat(value) {
  return /^sk_[A-Za-z0-9_-]+$/.test(value);
}

function isPrivateIpv4(ip) {
  return (
    ip === "0.0.0.0" ||
    ip === "127.0.0.1" ||
    ip === "169.254.169.254" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

function isPrivateIpv6(ip) {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

async function resolveSafeImageTarget(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    if (url.port && url.port !== "443") return false;
    const host = url.hostname.toLowerCase();
    const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
    if (blockedHosts.has(host)) return false;
    if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return false;

    if (net.isIP(host) === 4) {
      if (isPrivateIpv4(host)) return false;
      return { url, address: host, family: 4 };
    }
    if (net.isIP(host) === 6) {
      if (isPrivateIpv6(host)) return false;
      return { url, address: host, family: 6 };
    }

    const records = await dns.lookup(host, { all: true });
    if (!records.length) return false;
    for (const record of records) {
      if (record.family === 4 && isPrivateIpv4(record.address)) return false;
      if (record.family === 6 && isPrivateIpv6(record.address)) return false;
    }
    const selected = records[0];
    return { url, address: selected.address, family: selected.family };
  } catch {
    return false;
  }
}

async function verifyAdmin(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith(`${AUTH_PREFIX} `)) {
    return { ok: false, status: 401, error: "Owner authentication is required." };
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: authorizationHeader,
      apikey: SUPABASE_ANON_KEY
    }
  });

  if (!response.ok) {
    return { ok: false, status: 401, error: "Owner authentication is invalid or expired." };
  }

  const user = await response.json().catch(() => null);
  if (user?.app_metadata?.olive_role !== "admin") {
    return { ok: false, status: 403, error: "Only Olive admin users can polish photos." };
  }

  return { ok: true, user };
}

async function fetchImageBuffer(target) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = https.request(
      {
        protocol: "https:",
        hostname: target.url.hostname,
        port: target.url.port || 443,
        path: `${target.url.pathname}${target.url.search}`,
        method: "GET",
        headers: { Accept: "image/*" },
        lookup: (_hostname, options, callback) => {
          const record = { address: target.address, family: target.family };
          if (options && options.all) {
            callback(null, [record]);
          } else {
            callback(null, record.address, record.family);
          }
        }
      },
      (response) => {
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400) {
          response.resume();
          safeReject(new Error("Image redirects are not allowed for security reasons."));
          return;
        } else if (status < 200 || status >= 300) {
          response.resume();
          safeReject(new Error("Unable to download the source image."));
          return;
        }

        const contentType = (response.headers["content-type"] || "").toLowerCase();
        if (!contentType.startsWith("image/")) {
          response.resume();
          safeReject(new Error("Source URL did not return an image."));
          return;
        }

        const contentLength = Number(response.headers["content-length"] || 0);
        if (contentLength > MAX_SOURCE_BYTES) {
          response.resume();
          safeReject(new Error("Source image is too large. Maximum allowed size is 10 MB."));
          return;
        }

        const chunks = [];
        let total = 0;
        let aborted = false;
        response.on("data", (chunk) => {
          total += chunk.length;
          if (total > MAX_SOURCE_BYTES) {
            aborted = true;
            request.destroy(new Error("Source image is too large. Maximum allowed size is 10 MB."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          if (aborted) return;
          safeResolve({
            buffer: Buffer.concat(chunks),
            contentType
          });
        });
        response.on("error", safeReject);
      }
    );

    request.on("error", safeReject);
    request.setTimeout(30000, () => request.destroy(new Error("Timed out downloading source image.")));
    request.end();
  });
}

function getPixelcutErrorMessage(status) {
  if (status === 400 || status === 415 || status === 422) {
    return "Pixelcut could not process the image URL. Use a valid public image.";
  }
  if (status === 401) {
    return "Pixelcut authentication failed on the server.";
  }
  if (status === 402 || status === 403) {
    return "Pixelcut credits are insufficient. Please recharge and try again.";
  }
  if (status === 429) {
    return "Pixelcut rate limit reached. Please try again shortly.";
  }
  if (status >= 500) {
    return "Pixelcut is temporarily unavailable. Please try again.";
  }
  return "Pixelcut returned an unexpected error.";
}

async function runBackgroundRemoval(sourceImageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await fetch("https://api.developer.pixelcut.ai/v1/remove-background", {
      method: "POST",
      headers: {
        "X-API-Key": PIXELCUT_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ image_url: sourceImageUrl, format: "png" }),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createHttpError(504, "Pixelcut request timed out.");
    }
    const transportCode = getTransportErrorCode(error);
    console.error("Pixelcut transport failure", { code: transportCode });
    throw createHttpError(502, `Pixelcut request failed (${transportCode}).`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw createHttpError(502, getPixelcutErrorMessage(response.status));
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    throw createHttpError(502, "Pixelcut returned an unexpected response format.");
  }

  const result = await response.json().catch(() => null);
  const resultTarget = result?.result_url ? await resolveSafeImageTarget(result.result_url) : false;
  if (!resultTarget) {
    throw createHttpError(502, "Pixelcut did not return a valid result image.");
  }

  const downloaded = await fetchImageBuffer(resultTarget);
  if (!downloaded?.buffer?.length) {
    throw createHttpError(502, "Pixelcut returned an empty result image.");
  }
  if (downloaded.buffer.length > MAX_PIXELCUT_BYTES) {
    throw createHttpError(502, "Pixelcut output is too large. Maximum allowed size is 10 MB.");
  }

  return downloaded.buffer;
}

function chooseBackgroundFromSubject(subjectImage) {
  let luminanceTotal = 0;
  let count = 0;

  subjectImage.scan(0, 0, subjectImage.bitmap.width, subjectImage.bitmap.height, function scan(_x, _y, idx) {
    const a = this.bitmap.data[idx + 3];
    if (a < 20) return;
    const r = this.bitmap.data[idx];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luminanceTotal += lum;
    count += 1;
  });

  if (!count) return "white";
  const avg = luminanceTotal / count;
  return avg >= 150 ? "black" : "white";
}

async function compositeOnBackground(subjectPngBuffer, forcedBackground = "auto") {
  const subject = await Jimp.read(subjectPngBuffer);
  const selected = forcedBackground === "black" || forcedBackground === "white"
    ? forcedBackground
    : chooseBackgroundFromSubject(subject);

  const backgroundColor = selected === "black" ? 0x000000ff : 0xffffffff;
  const base = new Jimp({
    width: subject.bitmap.width,
    height: subject.bitmap.height,
    color: backgroundColor
  });

  base.composite(subject, 0, 0);
  const outputBuffer = await base.getBuffer("image/png");

  return {
    outputBuffer,
    background: selected
  };
}

async function uploadToSupabaseStorage(imageBuffer, productId, authorizationHeader) {
  const storagePath = `${productId}/gallery-covers/${crypto.randomUUID()}-olive-polished.png`;
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${PRODUCT_BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: {
      Authorization: authorizationHeader,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "image/png",
      "x-upsert": "false"
    },
    body: imageBuffer
  });

  if (!response.ok) {
    throw createHttpError(502, "Supabase storage upload failed.");
  }

  return {
    storagePath,
    polishedImageUrl: `${SUPABASE_URL}/storage/v1/object/public/${PRODUCT_BUCKET}/${encodedPath}`
  };
}

function parseBody(reqBody) {
  if (!reqBody) return {};
  if (typeof reqBody === "object") return reqBody;
  if (typeof reqBody === "string") {
    try {
      return JSON.parse(reqBody);
    } catch {
      throw new Error("Request body must be valid JSON.");
    }
  }
  return {};
}

function sanitizeProductId(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  if (!PIXELCUT_API_KEY) {
    return send(res, 500, { error: "Pixelcut image processing is not configured on the server." });
  }
  if (!hasValidPixelcutKeyFormat(PIXELCUT_API_KEY)) {
    return send(res, 500, { error: "Pixelcut API key is formatted incorrectly. In Vercel, paste only the key value." });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return send(res, 500, { error: "Supabase auth verification is not configured on the server." });
  }

  const authResult = await verifyAdmin(req.headers.authorization || "");
  if (!authResult.ok) {
    return send(res, authResult.status, { error: authResult.error });
  }

  let body;
  try {
    body = parseBody(req.body);
  } catch (error) {
    return send(res, 400, { error: error.message });
  }

  const sourceImageUrl = String(body.sourceImageUrl || "").trim();
  const productId = sanitizeProductId(body.productId);
  const forcedBackground = String(body.background || "auto").toLowerCase();

  const safeTarget = sourceImageUrl ? await resolveSafeImageTarget(sourceImageUrl) : false;
  if (!safeTarget) {
    return send(res, 400, { error: "Provide a valid HTTPS image URL." });
  }

  if (!["auto", "black", "white"].includes(forcedBackground)) {
    return send(res, 400, { error: "Background must be auto, black, or white." });
  }
  if (!productId) {
    return send(res, 400, { error: "Product ID is required for polished image storage." });
  }

  try {
    const sourceImage = await fetchImageBuffer(safeTarget);
    if (!sourceImage?.buffer?.length) throw createHttpError(400, "Source URL returned an empty image.");
    const subjectPng = await runBackgroundRemoval(safeTarget.url.toString());
    const { outputBuffer, background } = await compositeOnBackground(subjectPng, forcedBackground);
    const upload = await uploadToSupabaseStorage(outputBuffer, productId, req.headers.authorization || "");

    return send(res, 200, {
      success: true,
      background,
      polishedImageUrl: upload.polishedImageUrl,
      storagePath: upload.storagePath
    });
  } catch (error) {
    return send(res, error?.status || 500, { error: error?.message || "Photo polish failed." });
  }
};
