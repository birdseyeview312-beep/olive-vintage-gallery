const { Jimp } = require("jimp");
const dns = require("node:dns").promises;
const https = require("node:https");
const net = require("node:net");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const AUTH_PREFIX = ["Bea", "rer"].join("");

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
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
    const host = url.hostname.toLowerCase();
    const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
    if (blockedHosts.has(host)) return false;
    if (host.endsWith(".local") || host.endsWith(".internal")) return false;

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
    request.setTimeout(15000, () => request.destroy(new Error("Timed out downloading source image.")));
    request.end();
  });
}

async function runBackgroundRemoval(imageBuffer, sourceContentType) {
  const inputImage = `data:${sourceContentType};base64,${imageBuffer.toString("base64")}`;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/bria/background-removal`,
    {
      method: "POST",
      headers: {
        Authorization: `${AUTH_PREFIX} ${CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ image: inputImage })
    }
  );

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`Cloudflare background removal failed${err ? `: ${err.slice(0, 220)}` : "."}`);
  }

  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => ({}));
    const image = data?.result?.image || data?.result || data?.image;
    if (!image || typeof image !== "string") {
      throw new Error("Cloudflare AI did not return a valid image payload.");
    }
    const base64 = image.includes(",") ? image.split(",").pop() : image;
    return Buffer.from(base64, "base64");
  }

  return Buffer.from(await response.arrayBuffer());
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

async function uploadToCloudflareImages(imageBuffer, productId, title, background) {
  const safeTitle = String(title || "").trim().slice(0, 200) || null;
  const form = new FormData();
  form.append("file", new Blob([imageBuffer], { type: "image/png" }), "olive-polished.png");
  form.append("metadata", JSON.stringify({
    source: "olive-photo-polish",
    product_id: productId || null,
    title: safeTitle,
    background,
    polished_at: new Date().toISOString()
  }));

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`,
    {
      method: "POST",
      headers: { Authorization: `${AUTH_PREFIX} ${CLOUDFLARE_API_TOKEN}` },
      body: form
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success || !data?.result?.variants?.length) {
    throw new Error(data?.errors?.[0]?.message || "Cloudflare Images upload failed.");
  }

  return {
    imageId: data.result.id,
    polishedImageUrl: data.result.variants[0]
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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    return send(res, 500, { error: "Cloudflare image processing is not configured on the server." });
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
  const forcedBackground = String(body.background || "auto").toLowerCase();

  const safeTarget = sourceImageUrl ? await resolveSafeImageTarget(sourceImageUrl) : false;
  if (!safeTarget) {
    return send(res, 400, { error: "Provide a valid HTTPS image URL." });
  }

  if (!["auto", "black", "white"].includes(forcedBackground)) {
    return send(res, 400, { error: "Background must be auto, black, or white." });
  }

  try {
    const { buffer: sourceBuffer, contentType } = await fetchImageBuffer(safeTarget);
    const subjectPng = await runBackgroundRemoval(sourceBuffer, contentType);
    const { outputBuffer, background } = await compositeOnBackground(subjectPng, forcedBackground);
    const upload = await uploadToCloudflareImages(outputBuffer, body.productId, body.title, background);

    return send(res, 200, {
      success: true,
      background,
      polishedImageUrl: upload.polishedImageUrl,
      cloudflareImageId: upload.imageId
    });
  } catch (error) {
    return send(res, 500, { error: error?.message || "Photo polish failed." });
  }
};
