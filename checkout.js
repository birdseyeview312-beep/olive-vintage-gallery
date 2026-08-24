import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const $ = id => document.getElementById(id);
const e = {
  spinner: $("checkoutSpinner"), eyebrow: $("checkoutEyebrow"), title: $("checkoutTitle"),
  message: $("checkoutMessage"), receipt: $("checkoutReceipt"), returnGallery: $("returnGallery"),
  contactGallery: $("contactGallery")
};

function money(value, currency="USD") {
  return new Intl.NumberFormat("en-US", {style:"currency", currency}).format(Number(value||0));
}
function esc(value="") { return String(value).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m])); }
function showError(message) {
  e.spinner.className = "checkout-spinner error";
  e.eyebrow.textContent = "CHECKOUT NEEDS ATTENTION";
  e.title.textContent = "We couldn't finish the confirmation.";
  e.message.textContent = message || "Please contact Olive Vintage Gallery and we will help verify the PayPal transaction.";
  e.contactGallery.classList.remove("hidden");
  e.returnGallery.classList.remove("hidden");
}

async function capture(orderId) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/paypal-checkout`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type":"application/json" },
    body: JSON.stringify({ action:"capture", order_id:orderId })
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok || !data.completed) throw new Error(data.error || "PayPal confirmation is still pending.");
  return data;
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  if (!token) { showError("The PayPal order reference is missing. If you completed a payment, contact the gallery so we can verify it."); return; }
  try {
    const data = await capture(token);
    e.spinner.className = "checkout-spinner done";
    e.eyebrow.textContent = "ACQUISITION CONFIRMED";
    e.title.textContent = "Thank you. This piece is yours.";
    e.message.textContent = "Your payment has been confirmed and the artwork has been marked sold. Olive Vintage Gallery will follow up using the contact information on your PayPal order for fulfillment and shipping.";
    e.receipt.innerHTML = `<div><span>Artwork</span><strong>${esc(data.title || "Olive Vintage Gallery artwork")}</strong></div><div><span>Paid</span><strong>${esc(money(data.amount,data.currency||"USD"))}</strong></div><div><span>Order</span><strong>${esc(String(data.order_id||token).slice(-12))}</strong></div>`;
    e.receipt.classList.remove("hidden");
    e.returnGallery.classList.remove("hidden");
    e.contactGallery.classList.remove("hidden");
  } catch (error) { showError(error.message); }
}
boot();
