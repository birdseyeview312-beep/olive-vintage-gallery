import { supabase } from "./supabase-client.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { getGalleryProducts } from "./gallery-data.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const hostSessionId = params.get("host");
const inviteToken = params.get("invite");
const mode = hostSessionId ? "host" : "guest";
const peerId = crypto.randomUUID();
let sessionInfo = null;
let iceServers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
let channel = null;
let pc = null;
let localStream = null;
let remoteStream = new MediaStream();
let pendingCandidates = [];
let helloTimer = null;
let offerInFlight = false;
let currentFacing = mode === "host" ? "environment" : "user";
let currentSpotlight = null;
let products = [];
let noticeTimer = null;
let roomStarted = false;
let clockTimer = null;
let guestTabChannel = null;

const els = {
  shell: $("roomShell"), roomKicker: $("roomKicker"), roomTitle: $("roomTitle"), connectionStatus: $("connectionStatus"), connectionDot: $("connectionDot"),
  mainVideo: $("mainVideo"), insetVideo: $("insetVideo"), mainVideoEmpty: $("mainVideoEmpty"), mainVideoLabel: $("mainVideoLabel"), insetVideoLabel: $("insetVideoLabel"),
  startGate: $("startGate"), startTitle: $("startTitle"), startCopy: $("startCopy"), startBtn: $("startRoomBtn"), startStatus: $("startStatus"),
  muteBtn: $("muteBtn"), videoBtn: $("videoBtn"), switchBtn: $("switchCameraBtn"), leaveBtn: $("leaveBtn"), endBtn: $("endBtn"), relayStatus: $("relayStatus"), sessionClock: $("sessionClock"),
  hostTools: $("hostSpotlightTools"), productSelect: $("productSelect"), spotlightBtn: $("spotlightBtn"), spotlightEmpty: $("spotlightEmpty"), spotlightCard: $("spotlightCard"), spotlightImage: $("spotlightImage"), spotlightCategory: $("spotlightCategory"), spotlightTitle: $("spotlightTitle"), spotlightMaker: $("spotlightMaker"), spotlightPrice: $("spotlightPrice"), spotlightBuy: $("spotlightBuy"), spotlightInquire: $("spotlightInquire"),
  chatForm: $("chatForm"), chatInput: $("chatInput"), chatMessages: $("chatMessages"), roomEnded: $("roomEnded"), endedLink: $("endedLink"), roomNotice: $("roomNotice")
};

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function money(value) {
  if (value === null || value === undefined || value === "") return "Price on request";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
}

function setConnection(text, kind = "") {
  els.connectionStatus.textContent = text;
  const wrap = els.connectionStatus.parentElement;
  wrap.classList.toggle("connected", kind === "connected");
  wrap.classList.toggle("error", kind === "error");
}

function notify(message) {
  els.roomNotice.textContent = message;
  els.roomNotice.classList.add("show");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => els.roomNotice.classList.remove("show"), 5000);
}

async function publicAccess(action, extra = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/private-viewing-access`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Private viewing access failed.");
  return data;
}

async function resolveRoom() {
  if (mode === "host") {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || session.user.app_metadata?.olive_role !== "admin") {
      throw new Error("Owner sign-in is required to host a private viewing.");
    }
    const { data, error } = await supabase.from("private_viewing_sessions").select("*").eq("id", hostSessionId).single();
    if (error || !data) throw new Error("Private viewing session not found.");
    sessionInfo = data;
    els.roomKicker.textContent = "OWNER · PRIVATE VIEWING";
    els.startBtn.textContent = "Start Camera & Open Room";
    els.startCopy.textContent = `You are hosting ${data.customer_name || "the collector"}. Use the rear camera to walk the gallery, spotlight products, and end the session when finished.`;
    els.mainVideoLabel.textContent = "Your gallery camera";
    els.insetVideoLabel.textContent = data.customer_name || "Collector";
    els.hostTools.classList.remove("hidden");
    els.endBtn.classList.remove("hidden");
    els.leaveBtn.classList.add("hidden");
    els.endedLink.href = "./admin/private-viewings.html";
    await loadProducts();
  } else {
    if (!inviteToken) throw new Error("A private invitation link is required.");
    const tokenKey = `olive-pv-lease:${await sha256Hex(inviteToken)}`;
    const savedLease = localStorage.getItem(tokenKey) || "";
    const access = await publicAccess("join", { invite_token: inviteToken, guest_lease: savedLease });
    sessionInfo = access.session;
    if (access.guest_lease) localStorage.setItem(tokenKey, access.guest_lease);
    if ("BroadcastChannel" in window) {
      guestTabChannel = new BroadcastChannel(`olive-pv-tab:${sessionInfo.id}`);
      let occupied = false;
      guestTabChannel.onmessage = event => {
        if (event.data === "probe") guestTabChannel.postMessage("occupied");
        if (event.data === "occupied") occupied = true;
      };
      guestTabChannel.postMessage("probe");
      await new Promise(resolve => setTimeout(resolve, 220));
      if (occupied) throw new Error("This private viewing is already open in another tab on this device.");
    }
    if (Array.isArray(access.ice_servers) && access.ice_servers.length) iceServers = access.ice_servers;
    els.roomKicker.textContent = "COLLECTOR · PRIVATE VIEWING";
    els.startTitle.textContent = sessionInfo.title || "Private Gallery Viewing";
    els.startCopy.textContent = `Welcome${sessionInfo.customer_name ? `, ${sessionInfo.customer_name}` : ""}. Enable your camera and microphone when you are ready to enter the private gallery room.`;
    els.mainVideoLabel.textContent = "Olive Vintage Gallery";
    els.insetVideoLabel.textContent = "You";
    els.endBtn.classList.add("hidden");
    els.leaveBtn.classList.remove("hidden");
    els.relayStatus.textContent = access.turn_configured ? "Encrypted WebRTC · relay ready" : "Encrypted WebRTC · direct connection";
  }
  els.roomTitle.textContent = sessionInfo.title || "Private Gallery Viewing";
  setConnection("Invitation verified");
  els.shell.classList.remove("loading");
  updateClock();
}

async function loadProducts() {
  try {
    products = await getGalleryProducts({ status: "available" });
    els.productSelect.innerHTML = `<option value="">Select artwork…</option>` + products.map(p => `<option value="${p.id}">${p.title}${p.price ? ` · ${money(p.price)}` : ""}</option>`).join("");
  } catch (error) {
    console.error(error);
    notify("Live product list could not be loaded.");
  }
}

function configureVideoLayout() {
  if (mode === "host") {
    els.mainVideo.srcObject = localStream;
    els.mainVideo.muted = true;
    els.insetVideo.srcObject = remoteStream;
    els.insetVideo.muted = false;
  } else {
    els.mainVideo.srcObject = remoteStream;
    els.mainVideo.muted = false;
    els.insetVideo.srcObject = localStream;
    els.insetVideo.muted = true;
  }
  els.mainVideoEmpty.style.display = "none";
}

async function startMedia() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support live camera access.");
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: { facingMode: { ideal: currentFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  configureVideoLayout();
}

function createPeerConnection() {
  pc?.close();
  pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
  pendingCandidates = [];
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.ontrack = event => {
    event.streams?.[0]?.getTracks().forEach(track => {
      if (!remoteStream.getTracks().some(t => t.id === track.id)) remoteStream.addTrack(track);
    });
    configureVideoLayout();
  };
  pc.onicecandidate = event => {
    if (event.candidate) send("signal", { kind: "candidate", candidate: event.candidate.toJSON() });
  };
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === "connected") setConnection("Live · connected", "connected");
    else if (state === "connecting") setConnection("Connecting…");
    else if (state === "failed") {
      setConnection("Connection needs retry", "error");
      notify("The direct video connection failed. Retry the room or use a different Wi-Fi/cellular network. A TURN relay can be added for maximum reliability.");
      if (mode === "host") setTimeout(() => makeOffer(true), 1000);
    } else if (state === "disconnected") setConnection("Reconnecting…");
    else if (state === "closed") setConnection("Room closed");
  };
}

async function send(event, payload = {}) {
  if (!channel) return;
  await channel.send({ type: "broadcast", event, payload: { ...payload, from: peerId, role: mode } });
}

async function makeOffer(iceRestart = false) {
  if (mode !== "host" || !pc || offerInFlight || pc.signalingState !== "stable") return;
  if (pc.connectionState === "connected" && !iceRestart) return;
  offerInFlight = true;
  try {
    const offer = await pc.createOffer({ iceRestart });
    await pc.setLocalDescription(offer);
    await send("signal", { kind: "offer", sdp: pc.localDescription });
  } finally {
    offerInFlight = false;
  }
}

async function addCandidate(candidate) {
  if (!candidate) return;
  if (!pc.remoteDescription) pendingCandidates.push(candidate);
  else await pc.addIceCandidate(candidate).catch(console.warn);
}

async function flushCandidates() {
  const queued = pendingCandidates.splice(0);
  for (const candidate of queued) await pc.addIceCandidate(candidate).catch(console.warn);
}

async function handleSignal(payload) {
  if (!pc || payload?.from === peerId) return;
  if (payload.kind === "offer" && mode === "guest") {
    await pc.setRemoteDescription(payload.sdp);
    await flushCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await send("signal", { kind: "answer", sdp: pc.localDescription });
  } else if (payload.kind === "answer" && mode === "host") {
    await pc.setRemoteDescription(payload.sdp);
    await flushCandidates();
  } else if (payload.kind === "candidate") {
    await addCandidate(payload.candidate);
  }
}

async function connectRealtime() {
  createPeerConnection();
  channel = supabase.channel(`pv:${sessionInfo.signal_topic}`, { config: { broadcast: { self: false, ack: false } } });
  channel
    .on("broadcast", { event: "hello" }, ({ payload }) => {
      if (payload?.from === peerId) return;
      if (mode === "host" && payload?.role === "guest") makeOffer(false);
    })
    .on("broadcast", { event: "signal" }, ({ payload }) => handleSignal(payload).catch(error => { console.error(error); setConnection("Video negotiation error", "error"); }))
    .on("broadcast", { event: "spotlight" }, ({ payload }) => { if (payload?.product) renderSpotlight(payload.product); })
    .on("broadcast", { event: "chat" }, ({ payload }) => { if (payload?.message) appendChat(payload.message, payload.role === mode, payload.role); })
    .on("broadcast", { event: "session-ended" }, () => showEnded())
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        setConnection("Waiting for other participant…");
        send("hello", { ready: true });
        clearInterval(helloTimer);
        let tries = 0;
        helloTimer = setInterval(() => {
          send("hello", { ready: true });
          if (++tries > 12 || pc?.connectionState === "connected") clearInterval(helloTimer);
        }, 1200);
      } else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
        setConnection("Realtime room error", "error");
      }
    });
}

async function startRoom() {
  if (roomStarted) return;
  roomStarted = true;
  els.startBtn.disabled = true;
  els.startStatus.textContent = "Requesting camera and microphone access…";
  try {
    await startMedia();
    await connectRealtime();
    if (mode === "host") {
      const now = new Date().toISOString();
      const patch = { status: "live", updated_at: now };
      if (!sessionInfo.started_at) patch.started_at = now;
      const { error } = await supabase.from("private_viewing_sessions").update(patch).eq("id", sessionInfo.id);
      if (error) console.warn(error);
    }
    els.startGate.classList.add("hidden");
  } catch (error) {
    roomStarted = false;
    els.startBtn.disabled = false;
    els.startStatus.textContent = error?.message || "Camera access failed.";
    setConnection("Camera access required", "error");
  }
}

async function switchCamera() {
  if (!localStream) return;
  const nextFacing = currentFacing === "environment" ? "user" : "environment";
  try {
    const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: nextFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    const nextTrack = next.getVideoTracks()[0];
    const sender = pc?.getSenders().find(s => s.track?.kind === "video");
    if (sender) await sender.replaceTrack(nextTrack);
    const oldTrack = localStream.getVideoTracks()[0];
    if (oldTrack) { localStream.removeTrack(oldTrack); oldTrack.stop(); }
    localStream.addTrack(nextTrack);
    currentFacing = nextFacing;
    configureVideoLayout();
    notify(nextFacing === "environment" ? "Rear camera active." : "Front camera active.");
  } catch (error) {
    notify("This device could not switch cameras.");
  }
}

function toggleMute() {
  const track = localStream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  els.muteBtn.classList.toggle("off", !track.enabled);
  els.muteBtn.querySelector("strong").textContent = track.enabled ? "Mute" : "Unmute";
}

function toggleVideo() {
  const track = localStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  els.videoBtn.classList.toggle("off", !track.enabled);
  els.videoBtn.querySelector("strong").textContent = track.enabled ? "Camera Off" : "Camera On";
}

function productPayload(p) {
  return { id: p.id, title: p.title, maker: p.maker, price: p.price, category: p.category, images: Array.isArray(p.images) ? p.images.slice(0, 8) : [], inquire_only: !!p.inquire_only, status: p.status };
}

function renderSpotlight(p) {
  currentSpotlight = p;
  els.spotlightEmpty.classList.add("hidden");
  els.spotlightCard.classList.remove("hidden");
  els.spotlightImage.src = p.images?.[0] || "./assets/olive-brand.jpg";
  els.spotlightImage.alt = p.title || "Artwork";
  els.spotlightCategory.textContent = p.category || "ART GLASS";
  els.spotlightTitle.textContent = p.title || "Artwork";
  els.spotlightMaker.textContent = p.maker || "Olive Vintage Gallery";
  els.spotlightPrice.textContent = p.inquire_only ? "Inquire" : money(p.price);
  const canBuy = p.status === "available" && !p.inquire_only && Number(p.price) > 0;
  els.spotlightBuy.classList.toggle("hidden", !canBuy);
  els.spotlightInquire.classList.toggle("hidden", canBuy);
  els.spotlightInquire.href = `mailto:Olivejewelvintage@gmail.com?subject=${encodeURIComponent(`Private viewing inquiry — ${p.title || "Artwork"}`)}`;
}

async function spotlightSelected() {
  const p = products.find(x => String(x.id) === els.productSelect.value);
  if (!p) return notify("Choose an artwork first.");
  const payload = productPayload(p);
  renderSpotlight(payload);
  await send("spotlight", { product: payload });
  if (mode === "host") supabase.from("private_viewing_sessions").update({ spotlight_product_id: p.id, updated_at: new Date().toISOString() }).eq("id", sessionInfo.id).then(() => {});
}

async function beginBuyNow() {
  if (!currentSpotlight?.id) return;
  els.spotlightBuy.disabled = true;
  els.spotlightBuy.textContent = "Opening checkout…";
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/paypal-checkout`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", product_id: currentSpotlight.id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.approve_url) throw new Error(data?.error || "Checkout could not be opened.");
    location.assign(data.approve_url);
  } catch (error) {
    notify(error?.message || "Checkout is temporarily unavailable.");
    els.spotlightBuy.disabled = false;
    els.spotlightBuy.textContent = "Buy Now";
  }
}

function appendChat(message, mine = false, role = "guest") {
  const el = document.createElement("div");
  el.className = `pvr-chat-message${mine ? " mine" : ""}`;
  const text = document.createElement("div");
  text.textContent = message;
  const meta = document.createElement("small");
  meta.textContent = `${mine ? "You" : role === "host" ? "Gallery" : "Collector"} · ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  el.append(text, meta);
  els.chatMessages.appendChild(el);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

async function sendChat(event) {
  event.preventDefault();
  const message = els.chatInput.value.trim().slice(0, 500);
  if (!message) return;
  els.chatInput.value = "";
  appendChat(message, true, mode);
  await send("chat", { message });
}

function updateClock() {
  clearInterval(clockTimer);
  const tick = () => {
    if (!sessionInfo) return;
    if (sessionInfo.scheduled_at) {
      const date = new Date(sessionInfo.scheduled_at);
      els.sessionClock.textContent = Number.isNaN(date.getTime()) ? "Private room" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
  };
  tick();
  clockTimer = setInterval(tick, 60000);
}

function cleanup() {
  clearInterval(helloTimer); clearInterval(clockTimer);
  localStream?.getTracks().forEach(t => t.stop());
  remoteStream?.getTracks().forEach(t => t.stop());
  pc?.close();
  if (channel) supabase.removeChannel(channel).catch(() => {});
  guestTabChannel?.close(); guestTabChannel = null;
  channel = null; pc = null;
}

function showEnded() {
  cleanup();
  els.roomEnded.classList.remove("hidden");
  setConnection("Session ended");
}

async function endSession() {
  if (mode !== "host") return;
  if (!confirm("End this private gallery viewing for both participants?")) return;
  await send("session-ended", {});
  const now = new Date().toISOString();
  await supabase.from("private_viewing_sessions").update({ status: "ended", ended_at: now, updated_at: now }).eq("id", sessionInfo.id);
  showEnded();
}

function leaveRoom() {
  cleanup();
  location.href = mode === "host" ? "./admin/private-viewings.html" : "./private-viewing.html";
}

els.startBtn.addEventListener("click", startRoom);
els.muteBtn.addEventListener("click", toggleMute);
els.videoBtn.addEventListener("click", toggleVideo);
els.switchBtn.addEventListener("click", switchCamera);
els.leaveBtn.addEventListener("click", leaveRoom);
els.endBtn.addEventListener("click", endSession);
els.spotlightBtn.addEventListener("click", spotlightSelected);
els.spotlightBuy.addEventListener("click", beginBuyNow);
els.chatForm.addEventListener("submit", sendChat);
window.addEventListener("pagehide", cleanup);

resolveRoom().catch(error => {
  console.error(error);
  els.startTitle.textContent = "Private room unavailable";
  els.startCopy.textContent = error?.message || "This private viewing invitation could not be opened.";
  els.startBtn.classList.add("hidden");
  els.startStatus.textContent = "Return to Olive Vintage Gallery or contact the gallery for a new invitation.";
  setConnection("Access unavailable", "error");
});
