import { supabase } from "./supabase-client.js";
import { SUPABASE_URL } from "./config.js";

const $ = id => document.getElementById(id);
const e = {
  accessPanel: $("accessPanel"), accessMessage: $("accessMessage"), auctionApp: $("auctionApp"), sessionEmail: $("sessionEmail"), signOutBtn: $("signOutBtn"),
  eventList: $("eventList"), newEventBtn: $("newEventBtn"), eventForm: $("eventForm"), eventId: $("eventId"), eventEditorTitle: $("eventEditorTitle"), eventTitle: $("eventTitle"), eventSlug: $("eventSlug"), eventSubtitle: $("eventSubtitle"), eventStatus: $("eventStatus"), eventDescription: $("eventDescription"), eventStarts: $("eventStarts"), eventEnds: $("eventEnds"), eventStream: $("eventStream"), eventHeroImage: $("eventHeroImage"), eventSoftClose: $("eventSoftClose"), eventPublished: $("eventPublished"), eventRegistrationOpen: $("eventRegistrationOpen"), eventApproval: $("eventApproval"), eventSaveMessage: $("eventSaveMessage"), deleteEventBtn: $("deleteEventBtn"),
  liveVideoPanel: $("liveVideoPanel"), liveVideoStreamPill: $("liveVideoStreamPill"), liveVideoCreateBtn: $("liveVideoCreateBtn"), liveVideoRefreshBtn: $("liveVideoRefreshBtn"), liveVideoMessage: $("liveVideoMessage"),
  lotWorkspace: $("lotWorkspace"), lotList: $("lotList"), lotCount: $("lotCount"), newLotBtn: $("newLotBtn"), lotForm: $("lotForm"), lotId: $("lotId"), lotProduct: $("lotProduct"), lotNumber: $("lotNumber"), lotTitle: $("lotTitle"), lotMaker: $("lotMaker"), lotDescription: $("lotDescription"), lotStartingBid: $("lotStartingBid"), lotIncrement: $("lotIncrement"), lotBuyNow: $("lotBuyNow"), lotStatus: $("lotStatus"), lotOpens: $("lotOpens"), lotCloses: $("lotCloses"), lotImageStrip: $("lotImageStrip"), lotCurrentBid: $("lotCurrentBid"), lotBidCount: $("lotBidCount"), lotLeader: $("lotLeader"), winningBidPanel: $("winningBidPanel"), deleteLotBtn: $("deleteLotBtn"), lotSaveMessage: $("lotSaveMessage"),
  bidderWorkspace: $("bidderWorkspace"), bidderList: $("bidderList"), bidderCount: $("bidderCount")
};

let session = null, events = [], selectedEvent = null, products = [], lots = [], selectedLot = null, registrations = [];
const esc = (s = "") => String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[m]));
const money = v => v === null || v === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(v));
const localValue = iso => { if (!iso) return ""; const d = new Date(iso), z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
const iso = v => v ? new Date(v).toISOString() : null;
const admin = () => session?.user?.app_metadata?.olive_role === "admin";
function msg(el, t, err = false) { if (!el) return; el.textContent = t || ""; el.style.color = err ? "#d58a83" : ""; }
function slugify(s) { return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

async function callLiveVideo(body) {
  const { data: { session: s } } = await supabase.auth.getSession();
  if (!s?.access_token) throw new Error("Owner sign-in has expired. Sign in again.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/cloudflare-settings`, {
    method: "POST",
    headers: { Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Cloudflare Realtime request failed.");
  return data;
}
function setLiveVideoBusy(busy) { [e.liveVideoCreateBtn, e.liveVideoRefreshBtn].forEach(b => { if (b) b.disabled = busy; }); }
function hasLiveVideoStream(eventRow) { return !!(eventRow?.stream_embed_url || eventRow?.cloudflare_stream_id); }
function renderLiveVideoPanel() {
  if (!e.liveVideoPanel) return;
  const saved = !!selectedEvent?.id;
  const created = hasLiveVideoStream(selectedEvent);
  e.liveVideoPanel.classList.toggle("disabled-panel", !saved);
  e.liveVideoCreateBtn.classList.toggle("hidden", !saved || created);
  e.liveVideoRefreshBtn.classList.toggle("hidden", !created);
  e.liveVideoStreamPill.className = "connection-pill";
  e.liveVideoStreamPill.textContent = !saved ? "Save first" : created ? "Broadcast ready" : "Not created";
  if (created) e.liveVideoStreamPill.classList.add("connected");
  msg(e.liveVideoMessage, !saved ? "Save this auction before creating its live-video broadcast." : created ? "Cloudflare Realtime playback is attached to this auction." : "Create a Cloudflare Realtime broadcast when you are ready to stream.");
}

async function boot() { const { data: { session: s } } = await supabase.auth.getSession(); session = s; renderAccess(); supabase.auth.onAuthStateChange(async (_x, s2) => { session = s2; renderAccess(); if (admin()) await loadAll(); }); if (admin()) await loadAll(); }
function renderAccess() { const ok = admin(); e.accessPanel.classList.toggle("hidden", ok); e.auctionApp.classList.toggle("hidden", !ok); e.signOutBtn.classList.toggle("hidden", !session); e.sessionEmail.textContent = session?.user?.email || ""; if (session && !ok) e.accessMessage.textContent = "This account is signed in but does not have Olive Vintage administrator access. Sign out and use the gallery administrator account."; }
e.signOutBtn.onclick = () => supabase.auth.signOut();
async function loadAll() { await Promise.all([loadEvents(), loadProducts()]); if (selectedEvent) await loadEventChildren(); }
async function loadEvents() { const { data, error } = await supabase.from("auction_events").select("*").order("created_at", { ascending: false }); if (error) { msg(e.eventSaveMessage, error.message, true); return; } events = data || []; if (selectedEvent) selectedEvent = events.find(x => x.id === selectedEvent.id) || null; if (!selectedEvent && events.length) selectedEvent = events[0]; renderEvents(); if (selectedEvent) fillEvent(selectedEvent); }
async function loadProducts() { const { data, error } = await supabase.from("products").select("id,inventory_number,title,maker,description,images,price,status").order("title"); if (error) return; products = data || []; e.lotProduct.innerHTML = '<option value="">Unlinked / custom lot</option>' + products.map(p => `<option value="${p.id}">${esc(p.inventory_number)} · ${esc(p.title)} · ${money(p.price)}</option>`).join(""); }
function renderEvents() { e.eventList.innerHTML = events.map(x => `<button class="event-row ${selectedEvent?.id === x.id ? "active" : ""}" data-event="${x.id}"><span>${esc(x.status)}${x.published ? " · PUBLISHED" : ""}${hasLiveVideoStream(x) ? " · VIDEO" : ""}</span><strong>${esc(x.title)}</strong><small>${x.starts_at ? new Date(x.starts_at).toLocaleString() : "Date not set"}</small></button>`).join("") || '<p class="muted">No auctions yet.</p>'; e.eventList.querySelectorAll("[data-event]").forEach(b => b.onclick = async () => { selectedEvent = events.find(x => x.id === b.dataset.event); fillEvent(selectedEvent); renderEvents(); await loadEventChildren(); }); }
function fillEvent(x) { e.eventForm.classList.remove("hidden"); e.eventEditorTitle.textContent = x.title; e.eventId.value = x.id; e.eventTitle.value = x.title || ""; e.eventSlug.value = x.slug || ""; e.eventSubtitle.value = x.subtitle || ""; e.eventStatus.value = x.status || "draft"; e.eventDescription.value = x.description || ""; e.eventStarts.value = localValue(x.starts_at); e.eventEnds.value = localValue(x.ends_at); e.eventStream.value = x.stream_embed_url || ""; e.eventHeroImage.value = x.hero_image || ""; e.eventSoftClose.value = x.soft_close_seconds || 15; e.eventPublished.checked = !!x.published; e.eventRegistrationOpen.checked = !!x.registration_open; e.eventApproval.checked = !!x.require_approval; e.lotWorkspace.classList.remove("hidden"); e.bidderWorkspace.classList.remove("hidden"); msg(e.eventSaveMessage, ""); renderLiveVideoPanel(); }
function clearEvent() { selectedEvent = null; e.eventForm.reset(); e.eventId.value = ""; e.eventEditorTitle.textContent = "New auction"; e.eventStatus.value = "draft"; e.eventSoftClose.value = 15; e.eventRegistrationOpen.checked = true; e.eventForm.classList.remove("hidden"); e.lotWorkspace.classList.add("hidden"); e.bidderWorkspace.classList.add("hidden"); renderEvents(); renderLiveVideoPanel(); }
e.newEventBtn.onclick = clearEvent; e.eventTitle.addEventListener("blur", () => { if (!e.eventSlug.value) e.eventSlug.value = slugify(e.eventTitle.value); });
e.eventForm.onsubmit = async ev => { ev.preventDefault(); msg(e.eventSaveMessage, "Saving…"); const payload = { title: e.eventTitle.value.trim(), slug: e.eventSlug.value.trim(), subtitle: e.eventSubtitle.value.trim() || null, description: e.eventDescription.value.trim() || null, status: e.eventStatus.value, starts_at: iso(e.eventStarts.value), ends_at: iso(e.eventEnds.value), stream_embed_url: e.eventStream.value.trim() || null, hero_image: e.eventHeroImage.value.trim() || null, soft_close_seconds: Number(e.eventSoftClose.value || 15), published: e.eventPublished.checked, registration_open: e.eventRegistrationOpen.checked, require_approval: e.eventApproval.checked }; let res; if (e.eventId.value) res = await supabase.from("auction_events").update(payload).eq("id", e.eventId.value).select().single(); else res = await supabase.from("auction_events").insert(payload).select().single(); if (res.error) { msg(e.eventSaveMessage, res.error.message, true); return; } selectedEvent = res.data; msg(e.eventSaveMessage, "Saved."); await loadEvents(); await loadEventChildren(); };
e.deleteEventBtn.onclick = async () => { if (!selectedEvent || !confirm("Delete this auction and all of its lots, registrations, and bids?")) return; const { error } = await supabase.from("auction_events").delete().eq("id", selectedEvent.id); if (error) { msg(e.eventSaveMessage, error.message, true); return; } selectedEvent = null; await loadEvents(); e.lotWorkspace.classList.add("hidden"); e.bidderWorkspace.classList.add("hidden"); renderLiveVideoPanel(); };

if (e.liveVideoCreateBtn) e.liveVideoCreateBtn.onclick = async () => {
  if (!selectedEvent?.id) return;
  setLiveVideoBusy(true);
  msg(e.liveVideoMessage, "Creating Cloudflare Realtime broadcast…");
  try {
    const data = await callLiveVideo({ action: "create_stream", auction_id: selectedEvent.id });
    const playerUrl = data.player_url || data.embed_url || data.stream_embed_url || "";
    if (playerUrl) {
      selectedEvent.stream_embed_url = playerUrl;
      e.eventStream.value = playerUrl;
      await supabase.from("auction_events").update({ stream_embed_url: playerUrl }).eq("id", selectedEvent.id);
    }
    selectedEvent.cloudflare_stream_id = data.stream_id || selectedEvent.cloudflare_stream_id || null;
    e.liveVideoStreamPill.textContent = "Broadcast ready";
    e.liveVideoStreamPill.classList.add("connected");
    e.liveVideoCreateBtn.classList.add("hidden");
    e.liveVideoRefreshBtn.classList.remove("hidden");
    msg(e.liveVideoMessage, "Broadcast created and attached to this auction.");
    await loadEvents();
  } catch (err) {
    msg(e.liveVideoMessage, err.message, true);
  } finally {
    setLiveVideoBusy(false);
  }
};
if (e.liveVideoRefreshBtn) e.liveVideoRefreshBtn.onclick = async () => {
  if (!selectedEvent?.id) return;
  setLiveVideoBusy(true);
  msg(e.liveVideoMessage, "Checking live-video signal…");
  try {
    const data = await callLiveVideo({ action: "stream_status", auction_id: selectedEvent.id });
    const status = data.status || "unknown";
    e.liveVideoStreamPill.textContent = status === "active" ? "LIVE SIGNAL" : status.toUpperCase();
    e.liveVideoStreamPill.classList.toggle("live-signal", status === "active");
    msg(e.liveVideoMessage, status === "active" ? "Cloudflare Realtime is receiving your live broadcast." : `Cloudflare stream status: ${status}. Start your broadcaster when ready.`);
  } catch (err) {
    msg(e.liveVideoMessage, err.message, true);
  } finally {
    setLiveVideoBusy(false);
  }
};

async function loadEventChildren() { if (!selectedEvent) return; const [l, r] = await Promise.all([supabase.from("auction_lots").select("*").eq("auction_id", selectedEvent.id).order("lot_number"), supabase.from("auction_registrations").select("*").eq("auction_id", selectedEvent.id).order("created_at")]); lots = l.data || []; registrations = r.data || []; if (selectedLot) selectedLot = lots.find(x => x.id === selectedLot.id) || null; renderLots(); renderRegistrations(); }
function renderLots() { e.lotCount.textContent = `${lots.length} lot${lots.length === 1 ? "" : "s"}`; e.lotList.innerHTML = lots.map(l => `<button class="lot-admin-row ${selectedLot?.id === l.id ? "active" : ""}" data-lot="${l.id}">${l.images?.[0] ? `<img class="lot-admin-thumb" src="${esc(l.images[0])}" alt="">` : '<div class="lot-admin-thumb"></div>'}<div><h3>Lot ${l.lot_number} · ${esc(l.title)}</h3><p>${money(l.current_bid ?? l.starting_bid)} · ${l.bid_count} bids</p></div><span class="status-${l.status}">${esc(l.status)}</span></button>`).join("") || '<p class="muted">No lots yet.</p>'; e.lotList.querySelectorAll("[data-lot]").forEach(b => b.onclick = () => { selectedLot = lots.find(x => x.id === b.dataset.lot); fillLot(selectedLot); renderLots(); }); }
function nextLotNumber() { return lots.length ? Math.max(...lots.map(x => x.lot_number)) + 1 : 1; }
function clearLot() { selectedLot = null; e.lotForm.reset(); e.lotId.value = ""; e.lotNumber.value = nextLotNumber(); e.lotIncrement.value = "10"; e.lotStatus.value = "draft"; e.lotCurrentBid.textContent = "—"; e.lotBidCount.textContent = "0"; e.lotLeader.textContent = "—"; e.lotImageStrip.innerHTML = ""; e.winningBidPanel.classList.add("hidden"); e.lotForm.classList.remove("hidden"); renderLots(); }
e.newLotBtn.onclick = clearLot;
function fillLot(l) { e.lotForm.classList.remove("hidden"); e.lotId.value = l.id; e.lotProduct.value = l.product_id || ""; e.lotNumber.value = l.lot_number; e.lotTitle.value = l.title || ""; e.lotMaker.value = l.maker || ""; e.lotDescription.value = l.description || ""; e.lotStartingBid.value = l.starting_bid; e.lotIncrement.value = l.bid_increment; e.lotBuyNow.value = l.buy_now_price ?? ""; e.lotStatus.value = l.status; e.lotOpens.value = localValue(l.opens_at); e.lotCloses.value = localValue(l.closes_at); e.lotImageStrip.innerHTML = (l.images || []).map(u => `<img src="${esc(u)}" alt="">`).join(""); e.lotCurrentBid.textContent = money(l.current_bid); e.lotBidCount.textContent = String(l.bid_count || 0); e.lotLeader.textContent = l.current_bidder_alias || "—"; loadWinningBid(l); }
e.lotProduct.onchange = () => { const p = products.find(x => x.id === e.lotProduct.value); if (!p) return; e.lotTitle.value = p.title || ""; e.lotMaker.value = p.maker || ""; e.lotDescription.value = p.description || ""; if (!e.lotStartingBid.value && p.price) e.lotStartingBid.value = Math.max(1, Math.round(Number(p.price) * .5)); e.lotImageStrip.innerHTML = (p.images || []).map(u => `<img src="${esc(u)}" alt="">`).join(""); };
async function loadWinningBid(l) { e.winningBidPanel.classList.add("hidden"); if (!l?.id || !l.bid_count) return; const { data } = await supabase.from("auction_bids").select("amount,bidder_alias,bidder_email,created_at").eq("lot_id", l.id).order("created_at", { ascending: false }).limit(1); const b = data?.[0]; if (!b) return; e.winningBidPanel.innerHTML = `<strong>Current high bidder</strong><br>${esc(b.bidder_alias)} · ${esc(b.bidder_email || "Email unavailable")} · ${money(b.amount)}`; e.winningBidPanel.classList.remove("hidden"); }
e.lotForm.onsubmit = async ev => { ev.preventDefault(); if (!selectedEvent) return; msg(e.lotSaveMessage, "Saving…"); const p = products.find(x => x.id === e.lotProduct.value); const old = selectedLot; const payload = { auction_id: selectedEvent.id, product_id: e.lotProduct.value || null, lot_number: Number(e.lotNumber.value), title: e.lotTitle.value.trim(), maker: e.lotMaker.value.trim() || null, description: e.lotDescription.value.trim() || null, images: p ? (p.images || []) : old?.images || [], starting_bid: Number(e.lotStartingBid.value), bid_increment: Number(e.lotIncrement.value), buy_now_price: e.lotBuyNow.value === "" ? null : Number(e.lotBuyNow.value), status: e.lotStatus.value, opens_at: iso(e.lotOpens.value), closes_at: iso(e.lotCloses.value) }; let res; if (e.lotId.value) res = await supabase.from("auction_lots").update(payload).eq("id", e.lotId.value).select().single(); else res = await supabase.from("auction_lots").insert(payload).select().single(); if (res.error) { msg(e.lotSaveMessage, res.error.message, true); return; } selectedLot = res.data; msg(e.lotSaveMessage, "Saved."); await loadEventChildren(); fillLot(selectedLot); };
e.deleteLotBtn.onclick = async () => { if (!selectedLot || !confirm(`Delete Lot ${selectedLot.lot_number}?`)) return; const { error } = await supabase.from("auction_lots").delete().eq("id", selectedLot.id); if (error) { msg(e.lotSaveMessage, error.message, true); return; } selectedLot = null; e.lotForm.classList.add("hidden"); await loadEventChildren(); };
function renderRegistrations() { e.bidderCount.textContent = `${registrations.length} registered`; e.bidderList.innerHTML = registrations.map(r => `<article class="bidder-row"><strong>${esc(r.display_name)}</strong><p>${esc(r.status)} · registered ${new Date(r.created_at).toLocaleString()}</p><div class="bidder-actions"><button class="ghost" data-status="approved" data-user="${r.user_id}">Approve</button><button class="ghost" data-status="registered" data-user="${r.user_id}">Registered</button><button class="ghost danger" data-status="suspended" data-user="${r.user_id}">Suspend</button></div></article>`).join("") || '<p class="muted">No bidder registrations yet.</p>'; e.bidderList.querySelectorAll("[data-user]").forEach(b => b.onclick = async () => { const { error } = await supabase.from("auction_registrations").update({ status: b.dataset.status }).eq("auction_id", selectedEvent.id).eq("user_id", b.dataset.user); if (!error) await loadEventChildren(); }); }
boot();
