import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const menuBtn = document.getElementById("menuBtn");
const nav = document.getElementById("nav");
menuBtn?.addEventListener("click", () => {
  const open = nav?.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(!!open));
});
nav?.querySelectorAll("a").forEach(a => a.addEventListener("click", () => { nav.classList.remove("open"); menuBtn?.setAttribute("aria-expanded", "false"); }));
document.addEventListener("keydown", event => { if (event.key === "Escape") { nav?.classList.remove("open"); menuBtn?.setAttribute("aria-expanded", "false"); } });
document.getElementById("year").textContent = new Date().getFullYear();

const form = document.getElementById("privateViewingRequestForm");
const submit = document.getElementById("requestSubmit");
const status = document.getElementById("requestStatus");

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  submit.disabled = true;
  submit.textContent = "Sending request…";
  setStatus("Preparing your request.");

  const preferred = document.getElementById("preferredStart").value;
  const preferredIso = preferred ? new Date(preferred).toISOString() : null;
  const body = {
    action: "request",
    customer_name: document.getElementById("customerName").value.trim(),
    customer_email: document.getElementById("customerEmail").value.trim(),
    customer_phone: document.getElementById("customerPhone").value.trim(),
    preferred_start: preferredIso,
    preferred_window: document.getElementById("preferredWindow").value.trim(),
    message: document.getElementById("requestMessage").value.trim(),
    website: document.getElementById("website").value,
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/private-viewing-access`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "The request could not be sent.");
    form.reset();
    setStatus("Request received. We’ll review your preferences and send a private invitation when your appointment is confirmed.");
    submit.textContent = "Request received";
  } catch (error) {
    setStatus(error?.message || "Private viewing requests are temporarily unavailable.", true);
    submit.disabled = false;
    submit.textContent = "Request Private Viewing";
  }
});
