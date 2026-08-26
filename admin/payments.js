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
  webhookSignatureKey: $("webhookSignatureKey"), toggleWebhookKey: $("toggleWebhookKey"),
  testBtn: $("testBtn"), disconnectBtn: $("disconnectBtn"), saveMessage: $("saveMessage")
};
let session = null;
let paymentStatus = { configured:false, mode:"sandbox", app_id_hint:null, location_id_hint:null };
const isAdmin = () => session?.user?.app_metadata?.olive_role === "admin";

function setMessage(text, type="") {
  e.saveMessage.textContent = text || "";
  e.saveMessage.className = `message ${type}`.trim();
}
function setBusy(busy) {
  [...e.squareForm.querySelectorAll("button,input")].forEach(el => el.disabled = busy);
}
function setMode(mode) {
  const radio = e.squareForm.querySelector(`input[name="squareMode"][value="${mode === "production" ? "production" : "sandbox"}"]`);
  if (radio) radio.checked = true;
}
function renderStatus() {
  const configured = !!paymentStatus.configured;
  e.statusPill.textContent = configured ? "Square connected" : "Not connected";
  e.statusPill.classList.toggle("connected", configured);
  e.connectedSummary.classList.toggle("hidden", !configured);
  e.disconnectBtn.classList.toggle("hidden", !configured);
  e.connectionText.textContent = configured ? "Connected" : "Not connected";
  e.savedMode.textContent = paymentStatus.mode === "production" ? "Production" : "Sandbox";
  e.appIdHint.textContent = paymentStatus.app_id_hint ? `••••••${paymentStatus.app_id_hint}` : "—";
  e.locationHint.textContent = paymentStatus.location_id_hint ? `••••••${paymentStatus.location_id_hint}` : "—";
  setMode(paymentStatus.mode);
  if (configured) {
    e.appId.value = "";
    e.locationId.value = "";
    e.accessToken.value = "";
    e.webhookSignatureKey.value = "";
    e.appId.placeholder = "Enter a new Application ID only when replacing the connection";
    e.locationId.placeholder = "Enter a new Location ID only when replacing the connection";
    e.accessToken.placeholder = "Enter a new Access Token only when replacing the connection";
    e.webhookSignatureKey.placeholder = "Enter a new Webhook Signature Key only when replacing";
  }
}
async function callSettings(method="GET", body=null) {
  const { data:{ session: current } } = await supabase.auth.getSession();
  if (!current?.access_token) throw new Error("Owner sign-in has expired. Sign in again.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/square-settings`, {
    method,
    headers: {
      Authorization: `******
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
  const { data:{ session:s } } = await supabase.auth.getSession();
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
e.toggleWebhookKey.onclick = () => {
  const visible = e.webhookSignatureKey.type === "text";
  e.webhookSignatureKey.type = visible ? "password" : "text";
  e.toggleWebhookKey.textContent = visible ? "Show" : "Hide";
};

e.squareForm.onsubmit = async ev => {
  ev.preventDefault();
  const appId = e.appId.value.trim();
  const locationId = e.locationId.value.trim();
  const accessToken = e.accessToken.value.trim();
  const webhookSignatureKey = e.webhookSignatureKey.value.trim();
  const mode = e.squareForm.querySelector('input[name="squareMode"]:checked')?.value || "sandbox";
  if (!appId || !locationId || !accessToken) {
    setMessage(paymentStatus.configured ? "To replace the Square connection, enter the Application ID, Location ID, and Access Token." : "Enter the Square Application ID, Location ID, and Access Token.", "error");
    return;
  }
  if (mode === "production" && !confirm("Switch Square to Production mode? Real customer payments will use this connection once checkout is enabled.")) return;
  setBusy(true); setMessage("Encrypting and saving Square credentials…");
  try {
    const body = { app_id:appId, location_id:locationId, access_token:accessToken, mode };
    if (webhookSignatureKey) body.webhook_signature_key = webhookSignatureKey;
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
    const result = await callSettings("POST", { action:"test" });
    setMessage(`Square connection verified in ${result.mode === "production" ? "Production" : "Sandbox"} mode.`, "success");
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
