import { supabase } from "./supabase-client.js";
import { PRODUCT_BUCKET } from "./config.js";

const $ = id => document.getElementById(id);
const els = {
  loginPanel:$("loginPanel"), appPanel:$("appPanel"), loginForm:$("loginForm"),
  loginEmail:$("loginEmail"), loginPassword:$("loginPassword"), loginMessage:$("loginMessage"),
  signOutBtn:$("signOutBtn"), sessionEmail:$("sessionEmail"), newPieceBtn:$("newPieceBtn"),
  searchInput:$("searchInput"), statusFilter:$("statusFilter"), inventoryList:$("inventoryList"),
  resultCount:$("resultCount"), stats:$("stats"), pieceForm:$("pieceForm"), pieceId:$("pieceId"),
  inventoryNumber:$("inventoryNumber"), status:$("status"), title:$("title"), maker:$("maker"),
  category:$("category"), price:$("price"), datePeriod:$("datePeriod"), origin:$("origin"),
  medium:$("medium"), height:$("height"), width:$("width"), depth:$("depth"),
shippingWeightLb:$("shippingWeightLb"), shippingLength:$("shippingLength"),
shippingWidth:$("shippingWidth"), shippingHeight:$("shippingHeight"),
shippingSource:$("shippingSource"), shippingReadyNote:$("shippingReadyNote"),
  description:$("description"), condition:$("condition"), provenance:$("provenance"),
  featured:$("featured"), newArrival:$("newArrival"), inquireOnly:$("inquireOnly"),
  photoInput:$("photoInput"), photoPreview:$("photoPreview"), galleryCoverInput:$("galleryCoverInput"),
  galleryCoverPreview:$("galleryCoverPreview"), saveMessage:$("saveMessage"),
  editorTitle:$("editorTitle"), deleteBtn:$("deleteBtn"), resetBtn:$("resetBtn")
};

let products = [];
let existingImages = [];
let pendingFiles = [];
let existingCoverImage = null;
let pendingCoverFile = null;

function money(v){
  if(v === null || v === undefined || v === "") return "Price on request";
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v));
}
function escapeHtml(s=""){ return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m])); }

async function boot(){
  const { data:{ session } } = await supabase.auth.getSession();
  setSession(session);
  supabase.auth.onAuthStateChange((_e,session)=>setSession(session));
}
async function setSession(session){
  const authenticated = !!session;
  const signedIn = authenticated && session?.user?.app_metadata?.olive_role === "admin";
  els.loginPanel.classList.toggle("hidden",signedIn);
  els.appPanel.classList.toggle("hidden",!signedIn);
  els.signOutBtn.classList.toggle("hidden",!authenticated);
  els.sessionEmail.textContent = session?.user?.email || "";
  if(authenticated && !signedIn){
    els.loginMessage.textContent = "This account does not have Olive Vintage owner access.";
  } else if(signedIn){
    els.loginMessage.textContent = "";
    await loadProducts();
  }
}

els.loginForm.addEventListener("submit", async e=>{
  e.preventDefault(); els.loginMessage.textContent="Signing in…";
  const { error } = await supabase.auth.signInWithPassword({email:els.loginEmail.value.trim(),password:els.loginPassword.value});
  els.loginMessage.textContent = error ? error.message : "";
});
els.signOutBtn.addEventListener("click",()=>supabase.auth.signOut());

async function loadProducts(){
  const { data, error } = await supabase.from("products").select("*").order("updated_at",{ascending:false});
  if(error){ els.inventoryList.innerHTML=`<p class="message">${escapeHtml(error.message)}</p>`; return; }
  products = data || []; render();
}
function render(){
  const q=els.searchInput.value.trim().toLowerCase(), sf=els.statusFilter.value;
  const filtered=products.filter(p=>{
    const hay=[p.title,p.maker,p.category,p.inventory_number,p.origin].join(" ").toLowerCase();
    return (!q||hay.includes(q)) && (!sf||p.status===sf);
  });
  els.resultCount.textContent=`${filtered.length} piece${filtered.length===1?"":"s"}`;
  els.inventoryList.innerHTML=filtered.map(p=>`
    <button class="item" data-id="${p.id}" type="button">
      ${(p.gallery_cover_image || p.images?.[0]) ? `<img class="thumb" src="${escapeHtml(p.gallery_cover_image || p.images[0])}" alt="">` : `<div class="thumb"></div>`}
      <div><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.maker||"Unknown maker")} · ${money(p.price)}</p><p>${escapeHtml(p.inventory_number)}</p></div>
      <span class="status">${escapeHtml(p.status)}</span>
    </button>`).join("") || `<p class="muted">No matching pieces.</p>`;
  els.inventoryList.querySelectorAll(".item").forEach(b=>b.addEventListener("click",()=>editPiece(b.dataset.id)));
  const counts = {available:0,reserved:0,sold:0,draft:0};
  products.forEach(p=>counts[p.status]=(counts[p.status]||0)+1);
  els.stats.innerHTML=[
    ["Total pieces",products.length],["Available",counts.available],["Sold",counts.sold],["Featured",products.filter(p=>p.featured).length]
  ].map(([a,b])=>`<div class="stat"><span class="muted">${a}</span><strong>${b}</strong></div>`).join("");
}
els.searchInput.addEventListener("input",render); els.statusFilter.addEventListener("change",render);

function clearForm(){
  els.pieceForm.reset(); els.pieceId.value=""; existingImages=[]; pendingFiles=[]; existingCoverImage=null; pendingCoverFile=null;
  els.editorTitle.textContent="Add a piece"; els.deleteBtn.classList.add("hidden"); els.saveMessage.textContent="";
  renderCover(); renderPhotos();
}
function editPiece(id){
  const p=products.find(x=>x.id===id); if(!p)return;
  els.pieceId.value=p.id; els.inventoryNumber.value=p.inventory_number||""; els.status.value=p.status||"available";
  els.title.value=p.title||""; els.maker.value=p.maker||""; els.category.value=p.category||"Contemporary Studio Glass";
  els.price.value=p.price ?? ""; els.datePeriod.value=p.date_period||""; els.origin.value=p.origin||"";
  els.medium.value=p.medium||""; els.height.value=p.height||""; els.width.value=p.width||""; els.depth.value=p.depth||"";els.shippingWeightLb.value=p.shipping_weight_oz ? Number(p.shipping_weight_oz)/16 : "";
els.shippingLength.value=p.shipping_length_in ?? "";
els.shippingWidth.value=p.shipping_width_in ?? "";
els.shippingHeight.value=p.shipping_height_in ?? "";
els.shippingSource.value=p.shipping_package_source || "Not set";

const shippingReady=[
  p.shipping_weight_oz,
  p.shipping_length_in,
  p.shipping_width_in,
  p.shipping_height_in
].every(v=>Number(v)>0);

els.shippingReadyNote.textContent=
  shippingReady ? "Shipping ready." : "Shipping data needed.";
  els.description.value=p.description||""; els.condition.value=p.condition||""; els.provenance.value=p.provenance||"";
  els.featured.checked=!!p.featured; els.newArrival.checked=!!p.new_arrival; els.inquireOnly.checked=!!p.inquire_only;
  existingImages=[...(p.images||[])]; pendingFiles=[]; existingCoverImage=p.gallery_cover_image||null; pendingCoverFile=null; els.editorTitle.textContent=p.title; els.deleteBtn.classList.remove("hidden");
  renderCover(); renderPhotos();
}
els.newPieceBtn.addEventListener("click",clearForm); els.resetBtn.addEventListener("click",clearForm);

els.galleryCoverInput.addEventListener("change",()=>{
  pendingCoverFile=Array.from(els.galleryCoverInput.files||[])[0]||null; els.galleryCoverInput.value=""; renderCover();
});
function renderCover(){
  if(!els.galleryCoverPreview)return;
  const src=pendingCoverFile?URL.createObjectURL(pendingCoverFile):existingCoverImage;
  els.galleryCoverPreview.innerHTML=src
    ? `<div class="gallery-cover-card"><img src="${escapeHtml(src)}" alt="Gallery cover preview"><div><strong>Public listing cover</strong><small>Original gallery photos remain untouched.</small></div><button type="button" id="removeGalleryCover">Remove</button></div>`
    : `<div class="gallery-cover-empty"><span>OV</span><div><strong>No gallery cover yet</strong><small>The first original photo will be used until a polished cover is added.</small></div></div>`;
  const remove=$("removeGalleryCover");
  if(remove)remove.onclick=()=>{existingCoverImage=null;pendingCoverFile=null;renderCover();};
}

els.photoInput.addEventListener("change",()=>{
  pendingFiles.push(...Array.from(els.photoInput.files||[])); els.photoInput.value=""; renderPhotos();
});
function renderPhotos(){
  const cards=[];
  existingImages.forEach((url,i)=>cards.push(`<div class="photo-card"><img src="${escapeHtml(url)}"><button type="button" data-existing="${i}">×</button></div>`));
  pendingFiles.forEach((f,i)=>cards.push(`<div class="photo-card"><img src="${URL.createObjectURL(f)}"><button type="button" data-pending="${i}">×</button></div>`));
  els.photoPreview.innerHTML=cards.join("");
  els.photoPreview.querySelectorAll("[data-existing]").forEach(b=>b.onclick=()=>{existingImages.splice(Number(b.dataset.existing),1);renderPhotos();});
  els.photoPreview.querySelectorAll("[data-pending]").forEach(b=>b.onclick=()=>{pendingFiles.splice(Number(b.dataset.pending),1);renderPhotos();});
}

async function uploadCoverFile(productId){
  if(!pendingCoverFile)return null;
  const clean=(pendingCoverFile.name||"gallery-cover").replace(/[^a-zA-Z0-9._-]/g,"-");
  const path=`${productId}/gallery-covers/${crypto.randomUUID()}-${clean}`;
  const { error }=await supabase.storage.from(PRODUCT_BUCKET).upload(path,pendingCoverFile,{cacheControl:"3600",upsert:false});
  if(error)throw error;
  const { data }=supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function uploadFiles(productId){
  const urls=[];
  for(const file of pendingFiles){
    const clean=(file.name||"image").replace(/[^a-zA-Z0-9._-]/g,"-");
    const path=`${productId}/${crypto.randomUUID()}-${clean}`;
    const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path,file,{cacheControl:"3600",upsert:false});
    if(error) throw error;
    const { data } = supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}
function formPayload(){
  return {
    inventory_number:els.inventoryNumber.value.trim(),
    status:els.status.value,
    title:els.title.value.trim(),
    maker:els.maker.value.trim()||null,
    category:els.category.value,
    price:els.price.value===""?null:Number(els.price.value),
    date_period:els.datePeriod.value.trim()||null,
    origin:els.origin.value.trim()||null,
    medium:els.medium.value.trim()||null,
    height:els.height.value.trim()||null,
    width:els.width.value.trim()||null,
    depth:els.depth.value.trim()||null,
    shipping_weight_oz:els.shippingWeightLb.value===""?null:Number(els.shippingWeightLb.value)*16,
shipping_length_in:els.shippingLength.value===""?null:Number(els.shippingLength.value),
shipping_width_in:els.shippingWidth.value===""?null:Number(els.shippingWidth.value),
shipping_height_in:els.shippingHeight.value===""?null:Number(els.shippingHeight.value),
shipping_package_source:[els.shippingWeightLb.value,els.shippingLength.value,els.shippingWidth.value,els.shippingHeight.value].some(Boolean)?"manual":null,
    description:els.description.value.trim()||null,
    condition:els.condition.value.trim()||null,
    provenance:els.provenance.value.trim()||null,
    featured:els.featured.checked,
    new_arrival:els.newArrival.checked,
    inquire_only:els.inquireOnly.checked,
    updated_at:new Date().toISOString()
  };
}
els.pieceForm.addEventListener("submit",async e=>{
  e.preventDefault(); els.saveMessage.textContent="Saving…";
  try{
    let id=els.pieceId.value;
    if(!id){
      const { data,error }=await supabase.from("products").insert({...formPayload(),images:[]}).select("id").single();
      if(error) throw error; id=data.id; els.pieceId.value=id;
    }
    const newCoverUrl=await uploadCoverFile(id);
    const newUrls=await uploadFiles(id);
    const payload={...formPayload(),gallery_cover_image:newCoverUrl||existingCoverImage||null,images:[...existingImages,...newUrls]};
    const { error }=await supabase.from("products").update(payload).eq("id",id);
    if(error) throw error;
    els.saveMessage.textContent="Saved."; await loadProducts(); editPiece(id);
  }catch(err){ els.saveMessage.textContent=err.message||String(err); }
});
els.deleteBtn.addEventListener("click",async()=>{
  const id=els.pieceId.value;if(!id)return;
  if(!confirm("Delete this artwork record? This cannot be undone."))return;
  const {error}=await supabase.from("products").delete().eq("id",id);
  if(error){els.saveMessage.textContent=error.message;return;}
  clearForm(); await loadProducts();
});
boot();
