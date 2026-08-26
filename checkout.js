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
  e.message.textContent = message || "Please contact Olive Vintage Gallery and we will help verify the Square transaction.";
  e.contactGallery.classList.remove("hidden");
  e.returnGallery.classList.remove("hidden");
}

async function checkStatus(orderId) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/square-checkout`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "status", order_id: orderId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Square confirmation failed.");
  return data;
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const provider = params.get("provider");
  const orderId = params.get("order");

  if (provider !== "square" || !orderId) {
    showError("The order reference is missing. If you completed a payment, contact the gallery so we can verify it.");
    return;
  }

  e.message.textContent = "Please keep this page open while Square confirms your payment with Olive Vintage Gallery.";

  try {
    let data = await checkStatus(orderId);

    // If payment is still pending, retry a few times before giving up
    if (!data.completed && data.pending) {
      const maxRetries = 4;
      const delay = ms => new Promise(res => setTimeout(res, ms));
      for (let i = 0; i < maxRetries; i++) {
        await delay(2500);
        data = await checkStatus(orderId);
        if (data.completed) break;
      }
    }

    if (!data.completed) {
      throw new Error(data.error || "Square payment confirmation is still pending. Please contact the gallery.");
    }

    e.spinner.className = "checkout-spinner done";
    e.eyebrow.textContent = "ACQUISITION CONFIRMED";
    e.title.textContent = "Thank you. This piece is yours.";
    e.message.textContent = "Your payment has been confirmed and the artwork has been marked sold. Olive Vintage Gallery will follow up using the contact information on your Square order for fulfillment and shipping.";
    e.receipt.innerHTML = `<div><span>Artwork</span><strong>${esc(data.title || "Olive Vintage Gallery artwork")}</strong></div><div><span>Paid</span><strong>${esc(money(data.amount, data.currency || "USD"))}</strong></div><div><span>Order</span><strong>${esc(String(data.order_id || orderId).slice(-12))}</strong></div>`;
    e.receipt.classList.remove("hidden");
    e.returnGallery.classList.remove("hidden");
    e.contactGallery.classList.remove("hidden");
  } catch (error) { showError(error.message); }
}
boot();
