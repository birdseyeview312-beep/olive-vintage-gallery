import { supabase } from "./supabase-client.js";
import { SUPABASE_URL } from "./config.js";

const $ = id => document.getElementById(id);
const e = {
  accessPanel: $("accessPanel"), accessMessage: $("accessMessage"), videoApp: $("videoApp"), sessionEmail: $("sessionEmail"), signOutBtn: $("signOutBtn"),
  cfStatusPill: $("cfStatusPill"), cfConnectedSummary: $("cfConnectedSummary"), cfAppIdHint: $("cfAppIdHint"), cfForm: $("cfForm"), cfAppId: $("cfAppId"), cfAppToken: $("cfAppToken"), cfToggleToken: $("cfToggleToken"), cfTestBtn: $("cfTestBtn"), cfDisconnectBtn: $("cfDisconnectBtn"), cfSaveMessage: $("cfSaveMessage")
};

let session = null;
let cfStatus = { configured: false, app_id_hint: null };
const isAdmin = () => session?.user?.app_metadata?.olive_role === "admin";

function cfMessage(text, type = "") {
  e.cfSaveMessage.textContent = text || "";
  e.cfSaveMessage.className = `message ${type}`.trim();
}
function cfBusy(on) {
  [...e.cfForm.querySelectorAll("button,input")].forEach(x => x.disabled = on);
}
function cfRenderStatus() {
  const configured = !!cfStatus.configured;
  e.cfStatusPill.textContent = configured ? "CF Realtime connected" : "Not connected";
  e.cfStatusPill.classList.toggle("connected", configured);
  e.cfConnectedSummary.classList.toggle("hidden", !configured);
  e.cfDisconnectBtn.classList.toggle("hidden", !configured);
  e.cfAppIdHint.textContent = cfStatus.app_id_hint ? `••••••${cfStatus.app_id_hint}` : "—";
  if (configured) {
    e.cfAppId.value = "";
    e.cfAppToken.value = "";
    e.cfAppId.placeholder = "Enter a new App ID only when replacing the connection";
    e.cfAppToken.placeholder = "Enter a new App Token only when replacing the connection";
  }
}
async function callCF(method = "GET", body = null) {
  const { data: { session: s } } = await supabase.auth.getSession();
  if (!s?.access_token) throw new Error("Owner sign-in has expired. Sign in again.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/cloudflare-settings`, {
    method,
    headers: { Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Cloudflare Realtime settings request failed.");
  return data;
}
async function cfLoadStatus() {
  cfMessage("Loading Cloudflare Realtime status…");
  try {
    cfStatus = await callCF("GET");
    cfRenderStatus();
    cfMessage("");
  } catch (err) {
    cfMessage(err.message, "error");
  }
}
function renderAccess() {
  const ok = isAdmin();
  e.accessPanel.classList.toggle("hidden", ok);
  e.videoApp.classList.toggle("hidden", !ok);
  e.signOutBtn.classList.toggle("hidden", !session);
  e.sessionEmail.textContent = session?.user?.email || "";
  if (session && !ok) e.accessMessage.textContent = "This signed-in account does not have Olive Vintage owner access.";
}
async function boot() {
  const { data: { session: s } } = await supabase.auth.getSession();
  session = s;
  renderAccess();
  if (isAdmin()) await cfLoadStatus();
  supabase.auth.onAuthStateChange(async (_event, next) => {
    session = next;
    renderAccess();
    if (isAdmin()) await cfLoadStatus();
  });
}

e.signOutBtn.onclick = async () => {
  await supabase.auth.signOut();
  location.href = "./dashboard.html";
};
e.cfToggleToken.onclick = () => {
  const visible = e.cfAppToken.type === "text";
  e.cfAppToken.type = visible ? "password" : "text";
  e.cfToggleToken.textContent = visible ? "Show" : "Hide";
};
e.cfForm.onsubmit = async ev => {
  ev.preventDefault();
  const appId = e.cfAppId.value.trim(), appToken = e.cfAppToken.value.trim();
  if (!appId || !appToken) {
    cfMessage(cfStatus.configured ? "To replace the Cloudflare connection, enter both the new App ID and App Token." : "Enter both the Cloudflare App ID and App Token.", "error");
    return;
  }
  cfBusy(true);
  cfMessage("Encrypting and saving Cloudflare credentials…");
  try {
    cfStatus = await callCF("POST", { app_id: appId, app_token: appToken });
    cfRenderStatus();
    cfMessage("Cloudflare credentials saved securely. Use Test Connection to verify them.", "success");
  } catch (err) {
    cfMessage(err.message, "error");
  } finally {
    cfBusy(false);
  }
};
e.cfTestBtn.onclick = async () => {
  cfBusy(true);
  cfMessage("Testing Cloudflare Realtime connection…");
  try {
    const result = await callCF("POST", { action: "test" });
    cfMessage(result.connected ? "Cloudflare Realtime connection verified." : "Cloudflare Realtime connection could not be verified.", result.connected ? "success" : "error");
  } catch (err) {
    cfMessage(err.message, "error");
  } finally {
    cfBusy(false);
  }
};
e.cfDisconnectBtn.onclick = async () => {
  if (!confirm("Disconnect Cloudflare Realtime from Olive Vintage? Low-latency features will be unavailable until a new connection is configured.")) return;
  cfBusy(true);
  cfMessage("Disconnecting Cloudflare Realtime…");
  try {
    cfStatus = await callCF("DELETE");
    cfRenderStatus();
    cfMessage("Cloudflare Realtime credentials removed from secure storage.", "success");
  } catch (err) {
    cfMessage(err.message, "error");
  } finally {
    cfBusy(false);
  }
};

boot();
