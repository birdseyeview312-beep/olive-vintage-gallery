import { supabase } from "./supabase-client.js";

const $ = id => document.getElementById(id);
const els = {
  app: $("app"), denied: $("accessDenied"), email: $("sessionEmail"), signOut: $("signOutBtn"), stats: $("stats"), refresh: $("refreshBtn"), requestList: $("requestList"), sessionList: $("sessionList"),
  form: $("sessionForm"), requestId: $("requestId"), title: $("title"), name: $("customerName"), customerEmail: $("customerEmail"), phone: $("customerPhone"), duration: $("duration"), scheduledAt: $("scheduledAt"), notes: $("notes"), createBtn: $("createBtn"), clearBtn: $("clearBtn"), formMessage: $("formMessage"),
  inviteBox: $("inviteBox"), inviteName: $("inviteName"), inviteUrl: $("inviteUrl"), copyInvite: $("copyInviteBtn"), hostRoomLink: $("hostRoomLink")
};
let authSession = null;
let requests = [];
let sessions = [];
let filter = "open";

function isAdmin() { return authSession?.user?.app_metadata?.olive_role === "admin"; }
function esc(value = "") { return String(value).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])); }
function formatDate(value) { if (!value) return "Time not set"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "Time not set" : d.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
function toLocalInput(value) { if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return ""; const pad = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function randomToken(bytes = 32) { const data = crypto.getRandomValues(new Uint8Array(bytes)); let s = ""; data.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
async function sha256Hex(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join(""); }

async function fetchAll(table, select, orderColumn = "created_at") {
  const pageSize = 10, out = []; let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).order(orderColumn, { ascending: false }).range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || []; out.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function load() {
  els.refresh.disabled = true;
  try {
    [requests, sessions] = await Promise.all([
      fetchAll("private_viewing_requests", "*"),
      fetchAll("private_viewing_sessions", "id,title,customer_name,customer_email,customer_phone,scheduled_at,duration_minutes,status,expires_at,notes,started_at,ended_at,last_guest_joined_at,created_at,updated_at", "scheduled_at")
    ]);
    renderStats(); renderRequests(); renderSessions();
  } catch (error) {
    console.error(error); els.requestList.innerHTML = `<div class="pv-empty">${esc(error.message || "Could not load private viewing data.")}</div>`;
  } finally { els.refresh.disabled = false; }
}

function renderStats() {
  const newRequests = requests.filter(r => r.status === "new").length;
  const openSessions = sessions.filter(s => ["scheduled","live"].includes(s.status)).length;
  const live = sessions.filter(s => s.status === "live").length;
  const completed = sessions.filter(s => s.status === "ended").length;
  els.stats.innerHTML = `<div class="stat"><span>New requests</span><strong>${newRequests}</strong></div><div class="stat"><span>Open sessions</span><strong>${openSessions}</strong></div><div class="stat"><span>Live now</span><strong>${live}</strong></div><div class="stat"><span>Completed</span><strong>${completed}</strong></div>`;
}

function renderRequests() {
  if (!requests.length) { els.requestList.innerHTML = `<div class="pv-empty">No private viewing requests yet.</div>`; return; }
  els.requestList.innerHTML = requests.map(r => `<article class="pv-request-card ${esc(r.status)}" data-request="${r.id}"><div class="pv-request-card-head"><div><h3>${esc(r.customer_name)}</h3><p>${esc(r.customer_email)}${r.customer_phone ? ` · ${esc(r.customer_phone)}` : ""}</p><div class="pv-request-meta">${r.preferred_start ? `Preferred: ${esc(formatDate(r.preferred_start))}` : esc(r.preferred_window || "No preferred time supplied")} · Requested ${esc(formatDate(r.created_at))}</div></div><span class="pv-state">${esc(r.status)}</span></div>${r.message ? `<div class="pv-message-detail">${esc(r.message)}</div>` : ""}<div class="pv-card-actions"><button class="accent" data-schedule="${r.id}" type="button">Schedule</button><button data-contacted="${r.id}" type="button">Mark contacted</button><button class="danger" data-decline="${r.id}" type="button">Decline</button></div></article>`).join("");
  els.requestList.querySelectorAll("[data-schedule]").forEach(btn => btn.addEventListener("click", () => fillFromRequest(btn.dataset.schedule)));
  els.requestList.querySelectorAll("[data-contacted]").forEach(btn => btn.addEventListener("click", () => updateRequest(btn.dataset.contacted, "contacted")));
  els.requestList.querySelectorAll("[data-decline]").forEach(btn => btn.addEventListener("click", () => updateRequest(btn.dataset.decline, "declined")));
}

function fillFromRequest(id) {
  const r = requests.find(x => x.id === id); if (!r) return;
  els.requestId.value = r.id; els.name.value = r.customer_name || ""; els.customerEmail.value = r.customer_email || ""; els.phone.value = r.customer_phone || ""; els.scheduledAt.value = toLocalInput(r.preferred_start); els.notes.value = r.message || "";
  els.formMessage.textContent = `Scheduling request from ${r.customer_name}.`;
  els.form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function updateRequest(id, status) {
  const { error } = await supabase.from("private_viewing_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return alert(error.message); await load();
}

function renderSessions() {
  const visible = filter === "open" ? sessions.filter(s => ["scheduled","live"].includes(s.status)) : sessions;
  if (!visible.length) { els.sessionList.innerHTML = `<div class="pv-empty">No ${filter === "open" ? "open " : ""}private viewing sessions.</div>`; return; }
  els.sessionList.innerHTML = visible.map(s => {
    const token = sessionStorage.getItem(`olive-pv-token:${s.id}`);
    return `<article class="pv-session-card ${esc(s.status)}"><div class="pv-session-card-head"><div><h3>${esc(s.customer_name)}</h3><p>${esc(s.title)} · ${esc(s.customer_email)}</p><div class="pv-session-meta">${esc(formatDate(s.scheduled_at))} · ${s.duration_minutes} min${s.last_guest_joined_at ? ` · Guest opened invite ${esc(formatDate(s.last_guest_joined_at))}` : ""}</div></div><span class="pv-state ${esc(s.status)}">${esc(s.status)}</span></div><div class="pv-card-actions">${["scheduled","live"].includes(s.status) ? `<a class="accent" href="../private-viewing-room.html?host=${encodeURIComponent(s.id)}">${s.status === "live" ? "Re-enter room" : "Enter owner room"}</a><button data-regenerate="${s.id}" type="button">${token ? "Copy invite" : "Regenerate invite"}</button><button class="danger" data-cancel="${s.id}" type="button">${s.status === "live" ? "End" : "Cancel"}</button>` : ""}</div>${["scheduled","live"].includes(s.status) && !token ? `<div class="invite-unavailable">For security, the original raw invite link is not stored. Regenerate it if you need another copy.</div>` : ""}</article>`;
  }).join("");
  els.sessionList.querySelectorAll("[data-regenerate]").forEach(btn => btn.addEventListener("click", () => regenerateInvite(btn.dataset.regenerate)));
  els.sessionList.querySelectorAll("[data-cancel]").forEach(btn => btn.addEventListener("click", () => closeSession(btn.dataset.cancel)));
}

function clearForm() {
  els.form.reset(); els.title.value = "Private Gallery Viewing"; els.duration.value = "30"; els.requestId.value = ""; els.formMessage.textContent = ""; els.inviteBox.classList.add("hidden");
}

function inviteUrl(token) { return `${location.origin}/private-viewing-room.html?invite=${encodeURIComponent(token)}`; }
function showInvite(session, token) {
  sessionStorage.setItem(`olive-pv-token:${session.id}`, token);
  els.inviteName.textContent = session.customer_name;
  els.inviteUrl.value = inviteUrl(token);
  els.hostRoomLink.href = `../private-viewing-room.html?host=${encodeURIComponent(session.id)}`;
  els.inviteBox.classList.remove("hidden");
  els.inviteBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function createSession(event) {
  event.preventDefault(); if (!els.form.reportValidity()) return;
  els.createBtn.disabled = true; els.formMessage.textContent = "Creating secure invitation…";
  try {
    const token = randomToken(32), signalTopic = randomToken(24), tokenHash = await sha256Hex(token);
    const scheduledRaw = els.scheduledAt.value;
    const scheduled = scheduledRaw ? new Date(scheduledRaw) : null;
    const duration = Number(els.duration.value) || 30;
    const base = scheduled && !Number.isNaN(scheduled.getTime()) ? scheduled.getTime() : Date.now();
    const expiresAt = new Date(base + (duration + 360) * 60 * 1000).toISOString();
    const payload = { title: els.title.value.trim() || "Private Gallery Viewing", customer_name: els.name.value.trim(), customer_email: els.customerEmail.value.trim(), customer_phone: els.phone.value.trim() || null, scheduled_at: scheduled ? scheduled.toISOString() : null, duration_minutes: duration, status: "scheduled", invite_token_hash: tokenHash, signal_topic: signalTopic, expires_at: expiresAt, notes: els.notes.value.trim() || null };
    const { data, error } = await supabase.from("private_viewing_sessions").insert(payload).select("id,title,customer_name,status,scheduled_at,duration_minutes").single();
    if (error) throw error;
    if (els.requestId.value) await supabase.from("private_viewing_requests").update({ status: "scheduled", updated_at: new Date().toISOString() }).eq("id", els.requestId.value);
    showInvite(data, token); els.formMessage.textContent = "Invitation created. Copy the private link and send it directly to the collector."; await load();
  } catch (error) { els.formMessage.textContent = error.message || "Could not create the private invitation."; }
  finally { els.createBtn.disabled = false; }
}

async function regenerateInvite(id) {
  const s = sessions.find(x => x.id === id); if (!s) return;
  const existing = sessionStorage.getItem(`olive-pv-token:${id}`);
  if (existing) { showInvite(s, existing); return; }
  if (!confirm("Generate a new invite link? Any earlier private invite link for this session will stop working.")) return;
  const token = randomToken(32), signalTopic = randomToken(24), tokenHash = await sha256Hex(token);
  const { error } = await supabase.from("private_viewing_sessions").update({ invite_token_hash: tokenHash, signal_topic: signalTopic, guest_lease_hash: null, guest_lease_expires_at: null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return alert(error.message);
  showInvite(s, token); await load();
}

async function closeSession(id) {
  const s = sessions.find(x => x.id === id); if (!s) return;
  if (!confirm(`${s.status === "live" ? "End" : "Cancel"} the private viewing for ${s.customer_name}?`)) return;
  const now = new Date().toISOString(), next = s.status === "live" ? "ended" : "cancelled";
  const patch = { status: next, guest_lease_hash: null, guest_lease_expires_at: null, updated_at: now }; if (next === "ended") patch.ended_at = now;
  const { error } = await supabase.from("private_viewing_sessions").update(patch).eq("id", id); if (error) return alert(error.message);
  sessionStorage.removeItem(`olive-pv-token:${id}`); await load();
}

els.form.addEventListener("submit", createSession);
els.clearBtn.addEventListener("click", clearForm);
els.refresh.addEventListener("click", load);
els.copyInvite.addEventListener("click", async () => { try { await navigator.clipboard.writeText(els.inviteUrl.value); els.formMessage.innerHTML = `<span class="pv-copy-ok">Invitation link copied.</span>`; } catch { els.inviteUrl.select(); document.execCommand("copy"); els.formMessage.textContent = "Invitation link copied."; } });
els.signOut.addEventListener("click", async () => { await supabase.auth.signOut(); location.href = "./dashboard.html"; });
document.querySelectorAll("[data-filter]").forEach(btn => btn.addEventListener("click", () => { filter = btn.dataset.filter; document.querySelectorAll("[data-filter]").forEach(x => x.classList.toggle("active", x === btn)); renderSessions(); }));

async function boot() {
  const { data: { session } } = await supabase.auth.getSession(); authSession = session; els.email.textContent = session?.user?.email || "";
  if (!isAdmin()) { els.denied.classList.remove("hidden"); return; }
  els.app.classList.remove("hidden"); await load();
  supabase.auth.onAuthStateChange((_event, next) => { authSession = next; if (!isAdmin()) location.href = "./dashboard.html"; });
}
boot();
