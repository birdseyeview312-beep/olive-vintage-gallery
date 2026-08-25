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
  description:$("description"), condition:$("condition"), provenance:$("provenance"),
  featured:$("featured"), newArrival:$("newArrival"), inquireOnly:$("inquireOnly"),
  photoInput:$("photoInput"), photoPreview:$("photoPreview"), galleryCoverInput:$("galleryCoverInput"),
  galleryCoverPreview:$("galleryCoverPreview"), coverSourcePicker:$("coverSourcePicker"),
  coverSourcePreview:$("coverSourcePreview"), createGalleryCoverBtn:$("createGalleryCoverBtn"),
  coverBuilderMessage:$("coverBuilderMessage"), galleryCoverState:$("galleryCoverState"),
  saveMessage:$("saveMessage"), editorTitle:$("editorTitle"), deleteBtn:$("deleteBtn"), resetBtn:$("resetBtn")
};

let products = [];
let existingImages = [];
let pendingFiles = [];
let existingCoverImage = null;
let pendingCoverFile = null;
let selectedCoverSource = null;
let objectUrls = [];

function money(v){
  if(v === null || v === undefined || v === "") return "Price on request";
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v));
}
function escapeHtml(s=""){ return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m])); }
function localUrl(file){
  const url=URL.createObjectURL(file); objectUrls.push(url); return url;
}
function clearObjectUrls(){ objectUrls.forEach(url=>URL.revokeObjectURL(url)); objectUrls=[]; }

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
  clearObjectUrls();
  els.pieceForm.reset(); els.pieceId.value=""; existingImages=[]; pendingFiles=[]; existingCoverImage=null; pendingCoverFile=null; selectedCoverSource=null;
  els.editorTitle.textContent="Add a piece"; els.deleteBtn.classList.add("hidden"); els.saveMessage.textContent="";
  if(els.coverBuilderMessage)els.coverBuilderMessage.textContent="Add original photos, then choose one as the source.";
  renderCoverBuilder(); renderCover(); renderPhotos();
}
function editPiece(id){
  clearObjectUrls();
  const p=products.find(x=>x.id===id); if(!p)return;
  els.pieceId.value=p.id; els.inventoryNumber.value=p.inventory_number||""; els.status.value=p.status||"available";
  els.title.value=p.title||""; els.maker.value=p.maker||""; els.category.value=p.category||"Contemporary Studio Glass";
  els.price.value=p.price ?? ""; els.datePeriod.value=p.date_period||""; els.origin.value=p.origin||"";
  els.medium.value=p.medium||""; els.height.value=p.height||""; els.width.value=p.width||""; els.depth.value=p.depth||"";
  els.description.value=p.description||""; els.condition.value=p.condition||""; els.provenance.value=p.provenance||"";
  els.featured.checked=!!p.featured; els.newArrival.checked=!!p.new_arrival; els.inquireOnly.checked=!!p.inquire_only;
  existingImages=[...(p.images||[])]; pendingFiles=[]; existingCoverImage=p.gallery_cover_image||null; pendingCoverFile=null;
  const savedSource=p.gallery_cover_source_image||existingImages[0]||null;
  selectedCoverSource=savedSource?{type:"existing",url:savedSource}:null;
  els.editorTitle.textContent=p.title; els.deleteBtn.classList.remove("hidden");
  if(els.coverBuilderMessage)els.coverBuilderMessage.textContent=selectedCoverSource?"Source photo selected and saved. Step 2 will generate the finished Olive cover from this image.":"Choose an original photo as the cover source.";
  renderCoverBuilder(); renderCover(); renderPhotos();
}
els.newPieceBtn.addEventListener("click",clearForm); els.resetBtn.addEventListener("click",clearForm);

els.galleryCoverInput.addEventListener("change",()=>{
  pendingCoverFile=Array.from(els.galleryCoverInput.files||[])[0]||null; els.galleryCoverInput.value=""; renderCover();
});
function renderCover(){
  if(!els.galleryCoverPreview)return;
  const src=pendingCoverFile?localUrl(pendingCoverFile):existingCoverImage;
  els.galleryCoverPreview.innerHTML=src
    ? `<div class="gallery-cover-card"><img src="${escapeHtml(src)}" alt="Gallery cover preview"><div><strong>Public listing cover</strong><small>Original gallery photos remain untouched.</small></div><button type="button" id="removeGalleryCover">Remove</button></div>`
    : `<div class="gallery-cover-empty"><span>OV</span><div><strong>No finished cover yet</strong><small>The first original photo will remain public until a finished cover is generated or uploaded.</small></div></div>`;
  const remove=$("removeGalleryCover");
  if(remove)remove.onclick=()=>{existingCoverImage=null;pendingCoverFile=null;renderCover();};
}

function coverSourceSrc(){
  if(!selectedCoverSource)return null;
  return selectedCoverSource.type==="pending" ? localUrl(selectedCoverSource.file) : selectedCoverSource.url;
}
function isSelectedExisting(url){ return selectedCoverSource?.type==="existing" && selectedCoverSource.url===url; }
function isSelectedPending(file){ return selectedCoverSource?.type==="pending" && selectedCoverSource.file===file; }
function renderCoverBuilder(){
  if(!els.coverSourcePicker||!els.coverSourcePreview)return;
  clearObjectUrls();
  const cards=[];
  existingImages.forEach((url,i)=>cards.push(`<button type="button" class="cover-source-card ${isSelectedExisting(url)?"selected":""}" data-cover-existing="${i}"><img src="${escapeHtml(url)}" alt="Original photo ${i+1}"><span>${isSelectedExisting(url)?"Selected":"Use photo"} ${i+1}</span></button>`));
  pendingFiles.forEach((file,i)=>{const src=localUrl(file);cards.push(`<button type="button" class="cover-source-card ${isSelectedPending(file)?"selected":""}" data-cover-pending="${i}"><img src="${escapeHtml(src)}" alt="New original photo ${existingImages.length+i+1}"><span>${isSelectedPending(file)?"Selected":"Use photo"} ${existingImages.length+i+1}</span></button>`);});
  els.coverSourcePicker.innerHTML=cards.join("")||`<div class="cover-source-empty">Add original photographs below to choose a Gallery Cover source.</div>`;
  els.coverSourcePicker.querySelectorAll("[data-cover-existing]").forEach(btn=>btn.onclick=()=>{
    selectedCoverSource={type:"existing",url:existingImages[Number(btn.dataset.coverExisting)]};
    els.coverBuilderMessage.textContent="Source selected. Save the piece to remember this choice, or continue to Create Gallery Cover.";
    renderCoverBuilder();
  });
  els.coverSourcePicker.querySelectorAll("[data-cover-pending]").forEach(btn=>btn.onclick=()=>{
    selectedCoverSource={type:"pending",file:pendingFiles[Number(btn.dataset.coverPending)]};
    els.coverBuilderMessage.textContent="New source selected. Save the piece to upload and remember this choice.";
    renderCoverBuilder();
  });
  const src=coverSourceSrc();
  els.coverSourcePreview.innerHTML=src
    ? `<div class="cover-source-stage"><img src="${escapeHtml(src)}" alt="Selected source photo"><span>SOURCE PHOTO</span></div>`
    : `<div class="cover-source-stage empty"><span>SELECT A SOURCE PHOTO</span></div>`;
  els.createGalleryCoverBtn.disabled=!selectedCoverSource;
  els.galleryCoverState.textContent=existingCoverImage||pendingCoverFile?"COVER READY":selectedCoverSource?"SOURCE READY":"STEP 1 READY";
}

els.createGalleryCoverBtn.addEventListener("click",()=>{
  if(!selectedCoverSource){els.coverBuilderMessage.textContent="Choose an original source photo first.";return;}
  els.coverBuilderMessage.textContent="Source is ready. Step 1 is complete for this piece. Step 2 will connect this button to the automatic Olive black-background generator.";
  els.galleryCoverState.textContent="READY FOR STEP 2";
});

els.photoInput.addEventListener("change",()=>{
  const added=Array.from(els.photoInput.files||[]);
  pendingFiles.push(...added); els.photoInput.value="";
  if(!selectedCoverSource && added[0]) selectedCoverSource={type:"pending",file:added[0]};
  renderCoverBuilder(); renderPhotos();
});
function renderPhotos(){
  const cards=[];
  existingImages.forEach((url,i)=>cards.push(`<div class="photo-card"><img src="${escapeHtml(url)}"><button type="button" data-existing="${i}">×</button></div>`));
  pendingFiles.forEach((f,i)=>cards.push(`<div class="photo-card"><img src="${localUrl(f)}"><button type="button" data-pending="${i}">×</button></div>`));
  els.photoPreview.innerHTML=cards.join("");
  els.photoPreview.querySelectorAll("[data-existing]").forEach(b=>b.onclick=()=>{
    const url=existingImages[Number(b.dataset.existing)];
    existingImages.splice(Number(b.dataset.existing),1);
    if(isSelectedExisting(url)) selectedCoverSource=existingImages[0]?{type:"existing",url:existingImages[0]}:pendingFiles[0]?{type:"pending",file:pendingFiles[0]}:null;
    renderCoverBuilder(); renderPhotos();
  });
  els.photoPreview.querySelectorAll("[data-pending]").forEach(b=>b.onclick=()=>{
    const file=pendingFiles[Number(b.dataset.pending)];
    pendingFiles.splice(Number(b.dataset.pending),1);
    if(isSelectedPending(file)) selectedCoverSource=existingImages[0]?{type:"existing",url:existingImages[0]}:pendingFiles[0]?{type:"pending",file:pendingFiles[0]}:null;
    renderCoverBuilder(); renderPhotos();
  });
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
  const uploads=[];
  for(const file of pendingFiles){
    const clean=(file.name||"image").replace(/[^a-zA-Z0-9._-]/g,"-");
    const path=`${productId}/${crypto.randomUUID()}-${clean}`;
    const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path,file,{cacheControl:"3600",upsert:false});
    if(error) throw error;
    const { data } = supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path);
    uploads.push({file,url:data.publicUrl});
  }
  return uploads;
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
    const uploaded=await uploadFiles(id);
    const newUrls=uploaded.map(x=>x.url);
    let sourceUrl=null;
    if(selectedCoverSource?.type==="existing") sourceUrl=selectedCoverSource.url;
    if(selectedCoverSource?.type==="pending") sourceUrl=uploaded.find(x=>x.file===selectedCoverSource.file)?.url||null;
    if(!sourceUrl) sourceUrl=existingImages[0]||newUrls[0]||null;
    const payload={
      ...formPayload(),
      gallery_cover_image:newCoverUrl||existingCoverImage||null,
      gallery_cover_source_image:sourceUrl,
      images:[...existingImages,...newUrls]
    };
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
