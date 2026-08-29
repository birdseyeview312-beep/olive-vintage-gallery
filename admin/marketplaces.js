import { supabase } from "./supabase-client.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const el = (id) => document.getElementById(id);
let session = null;
let status = null;

function showNotice(message, isError = false) {
  const node = el("notice");
  node.textContent = message;
  node.classList.remove("hidden", "error");
  if (isError) node.classList.add("error");
}
function formatDate(value) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Not yet" : date.toLocaleString();
}
function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}
async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
async function settingsRequest(method = "GET", body) {
  session = await getSession();
  if (!session) throw new Error("Your session expired. Sign in again from the Owner Dashboard.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-settings`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Marketplace request failed.");
  return data;
}
async function importNow() {
  session = await getSession();
  if (!session) throw new Error("Your session expired. Sign in again.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-import-worker`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "eBay import failed.");
  return data;
}
function setValue(id, value) {
  if (value !== undefined && value !== null) el(id).value = String(value);
}
function render(data) {
  status = data || {};
  const connected = status.credential_state === "connected" || Boolean(status.refresh_token_configured);
  el("connectionBadge").textContent = connected ? "Connected" : "Not connected";
  el("connectionBadge").className = `status-badge ${connected ? "connected" : "waiting"}`;
  el("credentialHint").textContent = status.client_id_hint ? `Saved: ${status.client_id_hint}` : "No credentials saved";
  setValue("mode", status.mode || "live");
  setValue("marketplaceId", status.marketplace_id || "EBAY_US");
  setValue("categoryId", status.category_id || "");
  setValue("locationKey", status.merchant_location_key || "");
  setValue("paymentPolicy", status.payment_policy_id || "");
  setValue("fulfillmentPolicy", status.fulfillment_policy_id || "");
  setValue("returnPolicy", status.return_policy_id || "");
  setValue("condition", status.condition || "USED_EXCELLENT");
  el("clientId").placeholder = status.client_id_hint ? "Leave blank to keep the saved Client ID" : "Paste the eBay Client ID";
  el("lastRun").textContent = formatDate(status.ebay_import_last_run || status.last_run);
  el("lastSuccess").textContent = formatDate(status.ebay_import_last_success || status.last_success);
  el("lastResult").textContent = status.ebay_import_last_error || (connected ? "Ready" : "Waiting for connection");
}
async function refresh() {
  const data = await settingsRequest();
  render(data);
}
function formPayload() {
  return {
    client_id: el("clientId").value.trim(),
    client_secret: el("clientSecret").value.trim(),
    refresh_token: el("refreshToken").value.trim(),
    mode: el("mode").value,
    marketplace_id: el("marketplaceId").value,
    category_id: el("categoryId").value.trim() || null,
    merchant_location_key: el("locationKey").value.trim() || null,
    payment_policy_id: el("paymentPolicy").value.trim() || null,
    fulfillment_policy_id: el("fulfillmentPolicy").value.trim() || null,
    return_policy_id: el("returnPolicy").value.trim() || null,
    condition: el("condition").value,
    enabled: true
  };
}
el("ebayForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = el("saveBtn");
  try {
    setBusy(button, true, "Saving…");
    const data = await settingsRequest("POST", formPayload());
    el("clientSecret").value = "";
    el("refreshToken").value = "";
    render(data);
    showNotice("eBay connection settings saved securely.");
  } catch (error) {
    showNotice(error.message, true);
  } finally { setBusy(button, false); }
});
el("testBtn").addEventListener("click", async () => {
  const button = el("testBtn");
  try {
    setBusy(button, true, "Testing…");
    const data = await settingsRequest("POST", { action: "discover" });
    if (data.locations?.length === 1) setValue("locationKey", data.locations[0].key);
    if (data.payment_policies?.length === 1) setValue("paymentPolicy", data.payment_policies[0].id);
    if (data.fulfillment_policies?.length === 1) setValue("fulfillmentPolicy", data.fulfillment_policies[0].id);
    if (data.return_policies?.length === 1) setValue("returnPolicy", data.return_policies[0].id);
    showNotice(`Connection successful. eBay reports ${data.inventory_total ?? "available"} inventory item(s). Discovered ${data.locations?.length || 0} location(s) and seller policies.`);
  } catch (error) { showNotice(error.message, true); }
  finally { setBusy(button, false); }
});
el("importBtn").addEventListener("click", async () => {
  const button = el("importBtn");
  try {
    setBusy(button, true, "Importing…");
    const data = await importNow();
    const draftCount = (data.imported_items || []).filter((item) => item.status === "draft").length;
    showNotice(`eBay sync complete: ${data.imported || 0} new item(s) imported; ${draftCount} held as draft; ${data.shipping_backfilled || 0} shipping record(s) updated.`);
    await refresh();
  } catch (error) { showNotice(error.message, true); }
  finally { setBusy(button, false); }
});
el("disconnectBtn").addEventListener("click", async () => {
  if (!confirm("Disconnect eBay and remove the saved seller credentials? Existing catalog items will remain.")) return;
  const button = el("disconnectBtn");
  try {
    setBusy(button, true, "Disconnecting…");
    const data = await settingsRequest("DELETE");
    el("clientId").value = "";
    el("clientSecret").value = "";
    el("refreshToken").value = "";
    render(data);
    showNotice("eBay has been disconnected. Existing Olive listings were not deleted.");
  } catch (error) { showNotice(error.message, true); }
  finally { setBusy(button, false); }
});
el("signOutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.href = "./dashboard.html";
});

(async function boot() {
  session = await getSession();
  const isAdmin = session?.user?.app_metadata?.olive_role === "admin";
  if (!isAdmin) return;
  el("accessPanel").classList.add("hidden");
  el("marketplaceApp").classList.remove("hidden");
  el("signOutBtn").classList.remove("hidden");
  el("sessionEmail").textContent = session.user.email || "";
  try { await refresh(); }
  catch (error) { showNotice(error.message, true); }
})();
