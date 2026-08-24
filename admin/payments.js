import { supabase } from "./supabase-client.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const $ = id => document.getElementById(id);
const e = {
  accessPanel: $("accessPanel"), accessMessage: $("accessMessage"), paymentsApp: $("paymentsApp"),
  sessionEmail: $("sessionEmail"), signOutBtn: $("signOutBtn"), statusPill: $("statusPill"),
  connectedSummary: $("connectedSummary"), connectionText: $("connectionText"), savedMode: $("savedMode"), clientHint: $("clientHint"),
  paypalForm: $("paypalForm"), clientId: $("clientId"), clientSecret: $("clientSecret"), toggleSecret: $("toggleSecret"),
  testBtn: $("testBtn"), disconnectBtn: $("disconnectBtn"), saveMessage: $("saveMessage")
};
let session = null;
let paymentStatus = { configured:false, mode:"sandbox", client_id_hint:null };
const isAdmin = () => session?.user?.app_metadata?.olive_role === "admin";

function setMessage(text, type="") {
  e.saveMessage.textContent = text || "";
  e.saveMessage.className = `message ${type}`.trim();
}
function setBusy(busy) {
  [...e.paypalForm.querySelectorAll("button,input")].forEach(el => el.disabled = busy);
}
function setMode(mode) {
  const radio = e.paypalForm.querySelector(`input[name="paypalMode"][value="${mode === "live" ? "live" : "sandbox"}"]`);
  if (radio) radio.checked = true;
}
function renderStatus() {
  const configured = !!paymentStatus.configured;
  e.statusPill.textContent = configured ? "PayPal connected" : "Not connected";
  e.statusPill.classList.toggle("connected", configured);
  e.connectedSummary.classList.toggle("hidden", !configured);
  e.disconnectBtn.classList.toggle("hidden", !configured);
  e.connectionText.textContent = configured ? "Connected" : "Not connected";
  e.savedMode.textContent = paymentStatus.mode === "live" ? "Live" : "Sandbox";
  e.clientHint.textContent = paymentStatus.client_id_hint ? `••••••${paymentStatus.client_id_hint}` : "—";
  setMode(paymentStatus.mode);
  if (configured) {
    e.clientId.value = "";
    e.clientSecret.value = "";
    e.clientId.placeholder = "Enter a new Client ID only when replacing the connection";
    e.clientSecret.placeholder = "Enter a new Client Secret only when replacing the connection";
  }
}
async function callSettings(method="GET", body=null) {
  const { data:{ session: current } } = await supabase.auth.getSession();
  if (!current?.access_token) throw new Error("Owner sign-in has expired. Sign in again.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/paypal-settings`, {
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
e.toggleSecret.onclick = () => {
  const visible = e.clientSecret.type === "text";
  e.clientSecret.type = visible ? "password" : "text";
  e.toggleSecret.textContent = visible ? "Show" : "Hide";
};

e.paypalForm.onsubmit = async ev => {
  ev.preventDefault();
  const clientId = e.clientId.value.trim();
  const clientSecret = e.clientSecret.value.trim();
  const mode = e.paypalForm.querySelector('input[name="paypalMode"]:checked')?.value || "sandbox";
  if (!clientId || !clientSecret) {
    setMessage(paymentStatus.configured ? "To replace the PayPal connection, enter both the new Client ID and new Client Secret." : "Enter both the PayPal Client ID and Client Secret.", "error");
    return;
  }
  if (mode === "live" && !confirm("Switch PayPal to LIVE mode? Real customer payments will use this connection once checkout is enabled.")) return;
  setBusy(true); setMessage("Encrypting and saving PayPal credentials…");
  try {
    paymentStatus = await callSettings("POST", { client_id:clientId, client_secret:clientSecret, mode });
    renderStatus();
    setMessage("PayPal credentials saved securely. Use Test Connection to verify them.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  } finally { setBusy(false); }
};

e.testBtn.onclick = async () => {
  setBusy(true); setMessage("Testing directly with PayPal…");
  try {
    const result = await callSettings("POST", { action:"test" });
    setMessage(`PayPal connection verified in ${result.mode === "live" ? "LIVE" : "Sandbox"} mode.`, "success");
  } catch (error) {
    setMessage(error.message, "error");
  } finally { setBusy(false); }
};

e.disconnectBtn.onclick = async () => {
  if (!confirm("Disconnect PayPal from Olive Vintage? This removes the saved PayPal credentials from secure storage.")) return;
  setBusy(true); setMessage("Removing PayPal credentials…");
  try {
    paymentStatus = await callSettings("DELETE");
    renderStatus();
    setMessage("PayPal disconnected. No PayPal credentials remain saved.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  } finally { setBusy(false); }
};

boot();
