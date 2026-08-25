import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { getGalleryProducts } from "./gallery-data.js";
import { bindProductImageGalleries } from "./product-gallery.js";

const grid = document.getElementById("collectionGrid");
const countEl = document.getElementById("collectionCount");
const filters = document.querySelectorAll("[data-collection-filter]");
const esc = (s="") => String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const money = value => value === null || value === undefined || value === "" ? "Price on request" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(value));
let rows = [];
let activeFilter = "available";
let checkoutEnabled = false;

async function getCheckoutEnabled(){
  try{
    const response=await fetch(`${SUPABASE_URL}/functions/v1/payment-status`,{method:"GET",headers:{apikey:SUPABASE_ANON_KEY},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    return response.ok&&data?.enabled===true;
  }catch{return false;}
}

function checkoutNotice(message, type = "") {
  let el = document.getElementById("checkoutNotice");
  if (!el) { el = document.createElement("div"); el.id="checkoutNotice"; el.className="checkout-notice"; el.setAttribute("role","status"); document.body.appendChild(el); }
  el.className=`checkout-notice show ${type}`.trim(); el.textContent=message;
  clearTimeout(checkoutNotice.timer); checkoutNotice.timer=setTimeout(()=>el.classList.remove("show"),6500);
}

async function beginBuyNow(productId, button){
  const original=button.innerHTML; button.disabled=true; button.innerHTML="Opening secure checkout…";
  try{
    const response=await fetch(`${SUPABASE_URL}/functions/v1/paypal-checkout`,{method:"POST",headers:{apikey:SUPABASE_ANON_KEY,"Content-Type":"application/json"},body:JSON.stringify({action:"create",product_id:productId})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.approve_url) throw new Error(data.error||"Secure checkout is temporarily unavailable.");
    window.location.assign(data.approve_url);
  }catch(error){checkoutNotice(error.message||"Secure checkout is temporarily unavailable.","error");button.disabled=false;button.innerHTML=original;}
}

function card(p,index){
  const image=p.gallery_cover_image||p.images?.[0];
  const isSold=p.status==="sold";
  const canBuy=checkoutEnabled&&!!p.id&&p.status==="available"&&!p.inquire_only&&p.price!==null&&p.price!==undefined&&Number(p.price)>0;
  const inquirySubject=encodeURIComponent(`Olive Vintage Gallery inquiry — ${p.title||"Artwork"}`);
  const action=isSold?`<span class="collection-status sold">Sold</span>`:canBuy?`<button class="product-buy-now" type="button" data-buy-product="${esc(p.id)}">Buy Now <span>↗</span></button>`:`<a class="product-inquire" href="mailto:Olivejewelvintage@gmail.com?subject=${inquirySubject}">Inquire <span>↗</span></a>`;
  return `<article class="product-card reveal visible ${isSold?"collection-sold":""}" data-product-id="${esc(p.id||"")}">
    ${image?`<button class="product-image live-product-image product-gallery-trigger" type="button" data-gallery-product="${esc(p.id)}" aria-label="View ${p.images?.length>1?`all ${p.images.length} photos`:"larger photo"} of ${esc(p.title)}"><div class="live-product-stage"><img src="${esc(image)}" alt="${esc(p.title)}" loading="lazy"></div><div class="product-image-topline"><span>${isSold?"Gallery Archive":"Available"}</span></div><div class="product-image-number">${p.images?.length>1?`${p.images.length} PHOTOS`:String(index+1).padStart(2,"0")}</div></button>`:`<div class="product-image live-product-image awaiting-product-image"><div class="awaiting-product-art" aria-hidden="true"><span class="awaiting-product-ring"></span><span class="awaiting-product-mark">OV</span></div><div class="product-image-topline"><span>${isSold?"Gallery Archive":"Photos being added"}</span></div><div class="awaiting-product-copy"><strong>${isSold?"Archive imagery in recovery":"Original imagery in recovery"}</strong><small>Exact marketplace photos only</small></div></div>`}
    <div class="product-info"><div class="product-meta-line"><p class="eyebrow">${esc(p.category||"COLLECTIBLE")}</p><span class="product-price">${isSold?"Sold":esc(p.inquire_only?"Inquire":money(p.price))}</span></div><h3>${esc(p.title)}</h3><div class="product-detail-row"><p>${esc([p.maker,p.date_period].filter(Boolean).join(" · ")||"Olive Vintage Gallery")}</p>${action}</div></div>
  </article>`;
}

function render(){
  const visible=activeFilter==="all"?rows:rows.filter(p=>p.status===activeFilter);
  const photoFirst=[...visible.filter(p=>p.images?.length),...visible.filter(p=>!p.images?.length)];
  grid.innerHTML=photoFirst.length?photoFirst.map(card).join(""):`<div class="collection-empty">No products in this view.</div>`;
  countEl.textContent=`${visible.length} ${activeFilter==="all"?"public records":activeFilter==="sold"?"sold works":"available works"}`;
  grid.querySelectorAll("[data-buy-product]").forEach(btn=>btn.addEventListener("click",()=>beginBuyNow(btn.dataset.buyProduct,btn)));
  bindProductImageGalleries(photoFirst,grid);
}

filters.forEach(btn=>btn.addEventListener("click",()=>{activeFilter=btn.dataset.collectionFilter;filters.forEach(b=>b.classList.toggle("active",b===btn));render();}));

async function boot(){
  try{
    const [inventory,paymentsReady]=await Promise.all([getGalleryProducts({status:null}),getCheckoutEnabled()]);
    checkoutEnabled=paymentsReady;
    rows=inventory.filter(p=>["available","reserved","sold"].includes(p.status));
    const available=rows.filter(p=>p.status==="available").length;
    const sold=rows.filter(p=>p.status==="sold").length;
    document.querySelector('[data-collection-filter="available"]').textContent=`Available · ${available}`;
    document.querySelector('[data-collection-filter="sold"]').textContent=`Sold Archive · ${sold}`;
    document.querySelector('[data-collection-filter="all"]').textContent=`All Public · ${rows.length}`;
    render();
  }catch(error){grid.innerHTML=`<div class="collection-empty">The collection could not be loaded right now.</div>`;console.error(error);}
}
boot();
