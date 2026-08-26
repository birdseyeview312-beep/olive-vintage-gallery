import { supabase } from "./supabase-client.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const $ = id => document.getElementById(id);
const e = {
  accessPanel: $("accessPanel"), accessMessage: $("accessMessage"), paymentsApp: $("paymentsApp"),
  sessionEmail: $("sessionEmail"), signOutBtn: $("signOutBtn"), statusPill: $("statusPill"),
  connectedSummary: $("connectedSummary"), connectionText: $("connectionText"), savedMode: $("savedMode"),
  appIdHint: $("appIdHint"), locationHint: $("locationHint"),
  squareForm: $("squareForm"), appId: $("appId"), locationId: $("locationId"),
  accessToken: $("accessToken"), toggleAccessToken: $("toggleAccessToken"),
  webhookSignature: $("webhookSignature"), toggleWebhookSignature: $("toggleWebhookSignature"),
  testBtn: $("testBtn"), disconnectBtn: $("disconnectBtn"), saveMessage: $("saveMessage")
};
let session = null;
// API returns: configured, enabled, mode ("sandbox"|"live"), application_id, location_id,
//              access_token_hint, webhook_configured
let paymentStatus = { configured: false, mode: "sandbox", application_id: null, location_id: null };
const isAdmin = () => session?.user?.app_metadata?.olive_role === "admin";

function setMessage(text, type="") {
  e.saveMessage.textContent = text || "";
  e.saveMessage.className = `message ${type}`.trim();
}
function setBusy(busy) {
  [...e.squareForm.querySelectorAll("button,input")].forEach(el => el.disabled = busy);
}
function setMode(mode) {
  const radio = e.squareForm.querySelector(`input[name="squareMode"][value="${mode === "live" ? "live" : "sandbox"}"]`);
  if (radio) radio.checked = true;
}
function renderStatus() {
  const configured = !!paymentStatus.configured;
  e.statusPill.textContent = configured ? "Square connected" : "Not connected";
  e.statusPill.classList.toggle("connected", configured);
  e.connectedSummary.classList.toggle("hidden", !configured);
  e.disconnectBtn.classList.toggle("hidden", !configured);
  e.connectionText.textContent = configured ? "Connected" : "Not connected";
  e.savedMode.textContent = paymentStatus.mode === "live" ? "Live" : "Sandbox";
  e.appIdHint.textContent = paymentStatus.application_id ? `●●●●●●${String(paymentStatus.application_id).slice(-6)}` : "—";
  e.locationHint.textContent = paymentStatus.location_id ? `●●●●●●${String(paymentStatus.location_id).slice(-6)}` : "—";
  setMode(paymentStatus.mode);
  e.accessToken.required = !configured;
  if (configured) {
    e.appId.value = "";
    e.locationId.value = "";
    e.accessToken.value = "";
    e.webhookSignature.value = "";
    e.appId.placeholder = "Enter a new Application ID only when replacing the connection";
    e.locationId.placeholder = "Required — enter Location ID";
    e.accessToken.placeholder = "Leave blank to keep the saved Access Token";
    e.webhookSignature.placeholder = "Leave blank to keep the saved Webhook Signature Key";
  } else {
    e.appId.placeholder = "Paste Application ID from Square Developer Console";
    e.locationId.placeholder = "Paste Location ID from Square Developer Console";
    e.accessToken.placeholder = "Paste Access Token — it will not be displayed again";
    e.webhookSignature.placeholder = "Paste Webhook Signature Key — it will not be displayed again";
  }
}
async function callSettings(method="GET", body=null) {
  const { data: { session: current } } = await supabase.auth.getSession();
  if (!current?.access_token) throw new Error("Owner sign-in has expired. Sign in again.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/square-settings`, {
    method,
    headers: {
            Authorization: `Bearer ${current.access_token}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Payment settings request failed.");
  return data;
}
async function loadStatus() {
  setMessage("Loading secure payment status…");
  try {
    paymentStatus = await callSettings("GET");
    renderStatus();
    setMessage("");
  } catch (error) {
    setMessage(error.message, "error");
  }
}
function renderAccess() {
  const ok = isAdmin();
  e.accessPanel.classList.toggle("hidden", ok);
  e.paymentsApp.classList.toggle("hidden", !ok);
  e.signOutBtn.classList.toggle("hidden", !session);
  e.sessionEmail.textContent = session?.user?.email || "";
  if (session && !ok) e.accessMessage.textContent = "This signed-in account does not have Olive Vintage owner access.";
}
async function boot() {
  const { data: { session: s } } = await supabase.auth.getSession();
  session = s;
  renderAccess();
  if (isAdmin()) await loadStatus();
  supabase.auth.onAuthStateChange(async (_event, next) => {
    session = next;
    renderAccess();
    if (isAdmin()) await loadStatus();
  });
}

e.signOutBtn.onclick = async () => { await supabase.auth.signOut(); location.href = "./dashboard.html"; };
e.toggleAccessToken.onclick = () => {
  const visible = e.accessToken.type === "text";
  e.accessToken.type = visible ? "password" : "text";
  e.toggleAccessToken.textContent = visible ? "Show" : "Hide";
};
e.toggleWebhookSignature.onclick = () => {
  const visible = e.webhookSignature.type === "text";
  e.webhookSignature.type = visible ? "password" : "text";
  e.toggleWebhookSignature.textContent = visible ? "Show" : "Hide";
};

e.squareForm.onsubmit = async ev => {
  ev.preventDefault();
  const applicationId = e.appId.value.trim();
  const locationId = e.locationId.value.trim();
  const accessToken = e.accessToken.value.trim();
  const webhookSignature = e.webhookSignature.value.trim();
  const mode = e.squareForm.querySelector('input[name="squareMode"]:checked')?.value || "sandbox";

  // Location ID is always required; Access Token only required for first connection
  if (!locationId || (!paymentStatus.configured && !accessToken)) {
    setMessage(
      paymentStatus.configured
        ? "Location ID is required (Access Token optional to keep existing)."
        : "Enter the Square Location ID and Access Token.",
      "error"
    );
    return;
  }
  if (mode === "live" && !confirm("Switch Square to Live mode? Real customer payments will use this connection once checkout is enabled.")) return;
  setBusy(true); setMessage("Encrypting and saving Square credentials…");
  try {
    const body = { application_id: applicationId, location_id: locationId, mode };
    if (accessToken) body.access_token = accessToken;
    if (webhookSignature) body.webhook_signature = webhookSignature;
    paymentStatus = await callSettings("POST", body);
    renderStatus();
    setMessage("Square credentials saved securely. Use Test Connection to verify them.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  } finally { setBusy(false); }
};

e.testBtn.onclick = async () => {
  setBusy(true); setMessage("Testing directly with Square…");
  try {
    const result = await callSettings("POST", { action: "test" });
    setMessage(`Square connection verified in ${result.mode === "live" ? "Live" : "Sandbox"} mode.`, "success");
  } catch (error) {
    setMessage(error.message, "error");
  } finally { setBusy(false); }
};

e.disconnectBtn.onclick = async () => {
  if (!confirm("Disconnect Square from Olive Vintage? This removes the saved Square credentials from secure storage.")) return;
  setBusy(true); setMessage("Removing Square credentials…");
  try {
    paymentStatus = await callSettings("DELETE");
    renderStatus();
    setMessage("Square disconnected. No Square credentials remain saved.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  } finally { setBusy(false); }
};

boot();
