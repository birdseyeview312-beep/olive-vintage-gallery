import { supabase } from "./supabase-client.js";

const $ = id => document.getElementById(id);
const els = {
  menuBtn: $("menuBtn"), nav: $("nav"),
  eventKicker: $("eventKicker"), eventHeroTitle: $("eventHeroTitle"), eventHeroDate: $("eventHeroDate"), heroCountdown: $("heroCountdown"),
  roomEyebrow: $("roomEyebrow"), roomTitle: $("roomTitle"), roomStatus: $("roomStatus"), noAuctionState: $("noAuctionState"), auctionExperience: $("auctionExperience"),
  streamStage: $("streamStage"), streamMessage: $("streamMessage"), streamStatus: $("streamStatus"), eventDateLine: $("eventDateLine"),
  currentLotNumber: $("currentLotNumber"), lotClock: $("lotClock"), currentLotImage: $("currentLotImage"), currentLotMaker: $("currentLotMaker"), currentLotTitle: $("currentLotTitle"), currentLotDescription: $("currentLotDescription"), currentBid: $("currentBid"), bidCount: $("bidCount"), leadingBidder: $("leadingBidder"),
  bidForm: $("bidForm"), bidAmount: $("bidAmount"), bidButton: $("bidButton"), bidMessage: $("bidMessage"),
  signedOutCard: $("signedOutCard"), signedInCard: $("signedInCard"), signedInEmail: $("signedInEmail"), signOutAuction: $("signOutAuction"), magicLinkForm: $("magicLinkForm"), bidderEmail: $("bidderEmail"), authMessage: $("authMessage"),
  registrationIntro: $("registrationIntro"), registrationForm: $("registrationForm"), displayName: $("displayName"), acceptTerms: $("acceptTerms"), registerButton: $("registerButton"), registrationMessage: $("registrationMessage"), registrationStatus: $("registrationStatus"),
  catalogNote: $("catalogNote"), lotGrid: $("lotGrid")
};

let session = null;
let event = null;
let lots = [];
let currentLot = null;
let registration = null;
let realtimeChannel = null;
let pollTimer = null;
let tickTimer = null;

const esc = (s="") => String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const money = v => v === null || v === undefined ? "—" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(v));
const isAdmin = () => session?.user?.app_metadata?.olive_role === "admin";
const eventIsPublic = e => !!e?.published && ["scheduled","live","ended"].includes(e.status);
const liveNow = () => event?.status === "live";

function fmtDate(iso){
  if(!iso) return "Date to be announced";
  return new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(iso));
}
function secondsLeft(iso){ return iso ? Math.floor((new Date(iso).getTime()-Date.now())/1000) : null; }
function durationText(seconds){
  if(seconds === null) return "";
  if(seconds <= 0) return "00:00";
  const d=Math.floor(seconds/86400), h=Math.floor((seconds%86400)/3600), m=Math.floor((seconds%3600)/60), s=seconds%60;
  if(d>0) return `${d}d ${String(h).padStart(2,"0")}h ${String(m).padStart(2,"0")}m`;
  if(h>0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function message(el,text,error=false){ if(!el)return; el.textContent=text||""; el.classList.toggle("error",!!error); }

function setupChrome(){
  $("year").textContent = new Date().getFullYear();
  els.menuBtn?.addEventListener("click",()=>{const open=els.nav.classList.toggle("open");els.menuBtn.setAttribute("aria-expanded",String(open));});
  els.nav?.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>els.nav.classList.remove("open")));
}

async function loadSession(){
  const {data:{session:s}}=await supabase.auth.getSession();
  session=s;
  renderAuth();
  supabase.auth.onAuthStateChange(async(_event,s2)=>{session=s2;registration=null;renderAuth();await loadAuction();});
}

function renderAuth(){
  const signed=!!session;
  els.signedOutCard.classList.toggle("hidden",signed);
  els.signedInCard.classList.toggle("hidden",!signed);
  els.signedInEmail.textContent=session?.user?.email||"";
  renderRegistration();
  updateBidControls();
}

async function fetchPrimaryEvent(){
  let q=supabase.from("auction_events").select("*").eq("published",true).in("status",["live","scheduled","ended"]).order("starts_at",{ascending:true,nullsFirst:false}).limit(4);
  const {data,error}=await q;
  if(error) throw error;
  const rows=data||[];
  const live=rows.find(x=>x.status==="live");
  const future=rows.find(x=>x.status==="scheduled" && (!x.starts_at || new Date(x.starts_at).getTime()>=Date.now()-86400000));
  if(live||future) return live||future;
  if(rows.length) return rows[rows.length-1];

  if(isAdmin()){
    const {data:adminRows,error:adminError}=await supabase.from("auction_events").select("*").order("updated_at",{ascending:false}).limit(1);
    if(adminError) throw adminError;
    return adminRows?.[0]||null;
  }
  return null;
}

async function loadAuction({quiet=false}={}){
  try{
    const nextEvent=await fetchPrimaryEvent();
    const changedId=nextEvent?.id!==event?.id;
    event=nextEvent;
    if(!event){lots=[];currentLot=null;registration=null;renderAll();return;}

    const {data:lotRows,error:lotError}=await supabase.from("auction_lots").select("*").eq("auction_id",event.id).order("lot_number",{ascending:true});
    if(lotError) throw lotError;
    lots=lotRows||[];

    if(session){
      const {data:regRows}=await supabase.from("auction_registrations").select("*").eq("auction_id",event.id).eq("user_id",session.user.id).limit(1);
      registration=regRows?.[0]||null;
    } else registration=null;

    const liveLot=lots.find(l=>l.status==="live");
    if(liveLot) currentLot=liveLot;
    else if(currentLot) currentLot=lots.find(l=>l.id===currentLot.id)||null;
    if(!currentLot) currentLot=lots.find(l=>["upcoming","sold","passed"].includes(l.status))||lots[0]||null;

    renderAll();
    if(changedId) subscribeRealtime();
  }catch(err){
    if(!quiet) console.error(err);
  }
}

function renderAll(){
  renderHero();
  renderRoom();
  renderCatalog();
  renderRegistration();
  updateBidControls();
}

function renderHero(){
  if(!event){
    els.eventKicker.textContent="NEXT AUCTION";
    els.eventHeroTitle.textContent="A new live auction is being curated.";
    els.eventHeroDate.textContent="Dates announced here first.";
    els.heroCountdown.hidden=true;
    return;
  }
  const adminPreview=isAdmin()&&!event.published;
  els.eventKicker.textContent=adminPreview?"ADMIN PREVIEW":event.status==="live"?"LIVE NOW":"NEXT AUCTION";
  els.eventHeroTitle.textContent=event.title;
  els.eventHeroDate.textContent=event.starts_at?fmtDate(event.starts_at):(adminPreview?"Draft event · not visible to public visitors":"Date to be announced");
  const left=event.starts_at?secondsLeft(event.starts_at):null;
  els.heroCountdown.hidden=!(event.status==="scheduled"&&left!==null&&left>0);
  if(!els.heroCountdown.hidden) els.heroCountdown.textContent=`Opens in ${durationText(left)}`;
}

function safeEmbed(url){
  if(!url) return null;
  try{
    const u=new URL(url);
    const allowed=["youtube.com","www.youtube.com","youtu.be","player.vimeo.com"];
    return allowed.some(host=>u.hostname===host||u.hostname.endsWith(`.${host}`))?u.href:null;
  }catch{return null;}
}

function renderRoom(){
  const show=!!event && (eventIsPublic(event)||isAdmin());
  els.noAuctionState.classList.toggle("hidden",show);
  els.auctionExperience.classList.toggle("hidden",!show);
  if(!show) return;

  els.roomTitle.textContent=event.title;
  els.roomEyebrow.textContent=isAdmin()&&!event.published?"ADMIN AUCTION PREVIEW":"LIVE AUCTION ROOM";
  els.roomStatus.classList.toggle("is-live",liveNow());
  els.roomStatus.innerHTML=`<span></span> ${liveNow()?"LIVE":"PREVIEW"}`;
  els.streamStatus.textContent=liveNow()?"LIVE":"PREVIEW";
  els.eventDateLine.textContent=fmtDate(event.starts_at);

  const embed=safeEmbed(event.stream_embed_url);
  if(embed && liveNow()){
    els.streamStage.innerHTML=`<iframe src="${esc(embed)}" title="Olive Vintage live auction video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  } else {
    els.streamStage.innerHTML=`<div class="stream-placeholder"><img src="./assets/olive-brand.jpg" alt="Olive Vintage Gallery"><p>${liveNow()?"LIVE VIDEO CONNECTING":"LIVE VIDEO"}</p><span>${event.stream_embed_url&&!embed?"Stream URL is awaiting a supported embed format.":"Broadcast begins when the auction goes live."}</span></div>`;
  }
  renderCurrentLot();
}

function renderCurrentLot(){
  const l=currentLot;
  if(!l){
    els.currentLotNumber.textContent="LOT —";els.currentLotTitle.textContent="Catalog in preparation";els.currentLotMaker.textContent="OLIVE VINTAGE GALLERY";els.currentLotDescription.textContent="";els.currentBid.textContent="—";els.bidCount.textContent="0";els.currentLotImage.innerHTML='<div class="lot-image-placeholder">Lot preview</div>';return;
  }
  els.currentLotNumber.textContent=`LOT ${String(l.lot_number).padStart(2,"0")}`;
  els.currentLotTitle.textContent=l.title;
  els.currentLotMaker.textContent=(l.maker||"OLIVE VINTAGE GALLERY").toUpperCase();
  els.currentLotDescription.textContent=l.description||"";
  els.currentBid.textContent=l.current_bid===null?money(l.starting_bid):money(l.current_bid);
  els.bidCount.textContent=String(l.bid_count||0);
  els.leadingBidder.textContent=l.current_bidder_alias?`Leading bid · ${l.current_bidder_alias}`:"";
  const image=l.images?.[0];
  els.currentLotImage.innerHTML=image?`<img src="${esc(image)}" alt="${esc(l.title)}">`:'<div class="lot-image-placeholder">Photographs coming soon</div>';
  const min=l.current_bid===null?Number(l.starting_bid):Number(l.current_bid)+Number(l.bid_increment);
  els.bidAmount.min=String(min);els.bidAmount.step=String(l.bid_increment);els.bidAmount.placeholder=min.toFixed(2);
}

function renderCatalog(){
  if(!event||!lots.length){els.catalogNote.textContent="The catalog will appear as soon as the first auction is published.";els.lotGrid.innerHTML='<div class="catalog-placeholder">No published lots yet.</div>';return;}
  els.catalogNote.textContent=`${lots.length} lot${lots.length===1?"":"s"} · ${event.status==="live"?"Bidding in progress":"Preview catalog"}`;
  els.lotGrid.innerHTML=lots.map(l=>{
    const img=l.images?.[0];
    const price=l.current_bid===null?`Opens ${money(l.starting_bid)}`:`Bid ${money(l.current_bid)}`;
    return `<article class="lot-card ${currentLot?.id===l.id?"is-current":""}" data-lot="${l.id}" tabindex="0" role="button" aria-label="Preview lot ${l.lot_number}: ${esc(l.title)}">
      <div class="lot-card-image">${img?`<img src="${esc(img)}" alt="${esc(l.title)}" loading="lazy">`:'<div class="lot-image-placeholder">Photos coming soon</div>'}</div>
      <div class="lot-card-meta"><span>LOT ${String(l.lot_number).padStart(2,"0")} · ${esc(l.status.toUpperCase())}</span><h3>${esc(l.title)}</h3><p>${esc(l.maker||"Olive Vintage Gallery")}</p><div class="lot-card-price"><span>${l.bid_count||0} bid${l.bid_count===1?"":"s"}</span><strong>${price}</strong></div></div>
    </article>`;
  }).join("");
  els.lotGrid.querySelectorAll("[data-lot]").forEach(card=>{
    const choose=()=>{currentLot=lots.find(l=>l.id===card.dataset.lot)||currentLot;renderCurrentLot();renderCatalog();updateBidControls();document.getElementById("live-room")?.scrollIntoView({behavior:"smooth",block:"start"});};
    card.addEventListener("click",choose);card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();choose();}});
  });
}

function renderRegistration(){
  if(!event || !event.published || !["scheduled","live"].includes(event.status)){
    els.registrationIntro.textContent=isAdmin()&&event?"This event is still an unpublished admin draft.":"Registration opens when an auction is announced.";
    els.registrationForm.classList.add("hidden");els.registrationStatus.classList.add("hidden");return;
  }
  if(!session){els.registrationIntro.textContent="Sign in first, then register your bidder paddle.";els.registrationForm.classList.add("hidden");els.registrationStatus.classList.add("hidden");return;}
  if(registration){
    els.registrationForm.classList.add("hidden");els.registrationStatus.classList.remove("hidden");
    const label=registration.status==="approved"?"Approved to bid":registration.status==="suspended"?"Bidding access suspended":event.require_approval?"Registered · awaiting approval":"Registered to bid";
    els.registrationStatus.innerHTML=`<strong>${esc(label)}</strong><br>Bidder name: ${esc(registration.display_name)}`;
    return;
  }
  if(!event.registration_open){els.registrationIntro.textContent="Registration is currently closed for this auction.";els.registrationForm.classList.add("hidden");els.registrationStatus.classList.add("hidden");return;}
  els.registrationIntro.textContent=event.require_approval?"Register now. Olive Vintage will approve your paddle before bidding.":"Choose the bidder name shown in the live room.";
  els.registrationForm.classList.remove("hidden");els.registrationStatus.classList.add("hidden");
}

function canBid(){
  if(!session||!registration||!event||!currentLot) return false;
  if(event.status!=="live"||currentLot.status!=="live") return false;
  if(registration.status==="suspended") return false;
  if(event.require_approval&&registration.status!=="approved") return false;
  if(currentLot.opens_at&&Date.now()<new Date(currentLot.opens_at).getTime()) return false;
  if(currentLot.closes_at&&Date.now()>=new Date(currentLot.closes_at).getTime()) return false;
  return true;
}
function updateBidControls(){
  const ok=canBid();
  els.bidAmount.disabled=!ok;els.bidButton.disabled=!ok;
  if(ok){els.bidButton.textContent="Place Bid";return;}
  if(!session) els.bidButton.textContent="Sign In to Bid";
  else if(!registration) els.bidButton.textContent="Register to Bid";
  else if(event?.require_approval&&registration.status!=="approved") els.bidButton.textContent="Approval Pending";
  else if(!liveNow()) els.bidButton.textContent="Bidding Not Open";
  else if(currentLot?.status!=="live") els.bidButton.textContent="Select the Live Lot";
  else els.bidButton.textContent="Bidding Closed";
}

async function subscribeRealtime(){
  if(realtimeChannel){await supabase.removeChannel(realtimeChannel);realtimeChannel=null;}
  if(!event) return;
  realtimeChannel=supabase.channel(`olive-auction-${event.id}`)
    .on("postgres_changes",{event:"*",schema:"public",table:"auction_lots",filter:`auction_id=eq.${event.id}`},()=>loadAuction({quiet:true}))
    .subscribe();
}

function tick(){
  if(event?.status==="scheduled"&&event.starts_at){const left=secondsLeft(event.starts_at);if(left!==null&&left>0){els.heroCountdown.hidden=false;els.heroCountdown.textContent=`Opens in ${durationText(left)}`;}else els.heroCountdown.hidden=true;}
  if(currentLot?.closes_at){const left=secondsLeft(currentLot.closes_at);els.lotClock.textContent=durationText(left);if(left!==null&&left<=0) updateBidControls();}else els.lotClock.textContent=currentLot?.status==="live"?"LIVE":"—:—";
}

els.magicLinkForm.addEventListener("submit",async e=>{
  e.preventDefault();message(els.authMessage,"Sending secure sign-in link…");
  const redirectTo=`${window.location.origin}${window.location.pathname}`;
  const {error}=await supabase.auth.signInWithOtp({email:els.bidderEmail.value.trim(),options:{emailRedirectTo:redirectTo}});
  message(els.authMessage,error?error.message:"Check your email for your Olive Vintage sign-in link.",!!error);
});
els.signOutAuction.addEventListener("click",()=>supabase.auth.signOut());

els.registrationForm.addEventListener("submit",async e=>{
  e.preventDefault();if(!session||!event)return;
  message(els.registrationMessage,"Registering your bidder paddle…");
  const payload={auction_id:event.id,user_id:session.user.id,display_name:els.displayName.value.trim(),status:"registered",terms_version:"v1",terms_accepted_at:new Date().toISOString()};
  const {error}=await supabase.from("auction_registrations").insert(payload);
  if(error){message(els.registrationMessage,error.message,true);return;}
  message(els.registrationMessage,"Registered.");await loadAuction();
});

els.bidForm.addEventListener("submit",async e=>{
  e.preventDefault();if(!canBid())return;
  const amount=Number(els.bidAmount.value);if(!Number.isFinite(amount)||amount<=0){message(els.bidMessage,"Enter a valid bid amount.",true);return;}
  els.bidButton.disabled=true;message(els.bidMessage,"Submitting bid…");
  const {error}=await supabase.from("auction_bids").insert({auction_id:event.id,lot_id:currentLot.id,bidder_id:session.user.id,bidder_alias:registration.display_name,amount});
  if(error){message(els.bidMessage,error.message,true);}else{message(els.bidMessage,"Bid accepted.");els.bidAmount.value="";await loadAuction({quiet:true});}
  updateBidControls();
});

async function boot(){
  setupChrome();
  await loadSession();
  await loadAuction();
  tickTimer=setInterval(tick,1000);
  pollTimer=setInterval(()=>loadAuction({quiet:true}),5000);
}
window.addEventListener("beforeunload",()=>{if(tickTimer)clearInterval(tickTimer);if(pollTimer)clearInterval(pollTimer);if(realtimeChannel)supabase.removeChannel(realtimeChannel);});
boot();
