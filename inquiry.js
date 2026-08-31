import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const dialog=document.createElement("div");
dialog.className="inquiry-dialog";
dialog.hidden=true;
dialog.innerHTML=`
  <button class="inquiry-backdrop" type="button" aria-label="Close inquiry form"></button>
  <section class="inquiry-panel" role="dialog" aria-modal="true" aria-labelledby="inquiryTitle">
    <button class="inquiry-close" type="button" aria-label="Close">×</button>
    <p class="eyebrow">PRIVATE GALLERY CONCIERGE</p>
    <h2 id="inquiryTitle">Contact Olive Vintage Gallery</h2>
    <p id="inquiryIntro" class="inquiry-intro"></p>
    <form id="galleryInquiryForm">
      <input id="inquiryType" type="hidden"><input id="inquiryProductId" type="hidden"><input id="inquiryProductTitle" type="hidden">
      <label class="inquiry-honeypot" aria-hidden="true">Website<input id="inquiryWebsite" tabindex="-1" autocomplete="off"></label>
      <div class="inquiry-fields two"><label>Name<input id="inquiryName" required autocomplete="name"></label><label>Email<input id="inquiryEmail" type="email" required autocomplete="email"></label></div>
      <div class="inquiry-fields two"><label>Phone <span>optional</span><input id="inquiryPhone" type="tel" autocomplete="tel"></label><label>Location <span>optional</span><input id="inquiryLocation" autocomplete="address-level2"></label></div>
      <label>Message<textarea id="inquiryMessage" rows="5" required maxlength="5000"></textarea></label>
      <label id="inquiryPhotosWrap" class="inquiry-photos">Photos <span>up to 5 images, 5 MB each</span><input id="inquiryPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
      <div id="inquiryFileList" class="inquiry-file-list"></div>
      <div class="inquiry-actions"><button class="button primary" type="submit">Send privately</button><span id="inquiryStatus" role="status" aria-live="polite"></span></div>
    </form>
    <div id="inquirySuccess" class="inquiry-success" hidden><span>✓</span><h3>Thank you.</h3><p>Your inquiry is safely in the gallery inbox. Olive Vintage Gallery will contact you directly.</p><button class="button text" type="button" data-inquiry-close>Close</button></div>
  </section>`;
document.body.appendChild(dialog);

const $=id=>document.getElementById(id);
const form=$("galleryInquiryForm"),status=$("inquiryStatus"),photos=$("inquiryPhotos");
let previousFocus=null,openedAt=0;
function close(){dialog.hidden=true;document.body.classList.remove("inquiry-open");previousFocus?.focus();}
function open(type,productId="",productTitle=""){
  previousFocus=document.activeElement;openedAt=Date.now();form.reset();$("inquiryFileList").textContent="";$("inquirySuccess").hidden=true;form.hidden=false;status.textContent="";
  $("inquiryType").value=type;$("inquiryProductId").value=productId;$("inquiryProductTitle").value=productTitle;
  const seller=type==="seller";
  $("inquiryTitle").textContent=seller?"Offer art glass to Olive":type==="buyer"?"Ask about this piece":"Contact Olive Vintage Gallery";
  $("inquiryIntro").textContent=seller?"Share a few details and clear photographs for a confidential review.":productTitle?`Your inquiry is connected to “${productTitle}.”`:"Tell us what caught your eye and how we can help.";
  $("inquiryMessage").placeholder=seller?"Approximate quantity, maker names, signatures, condition and anything else you know…":"What would you like to know?";
  $("inquiryPhotosWrap").hidden=!seller;
  dialog.hidden=false;document.body.classList.add("inquiry-open");$("inquiryName").focus();
}
dialog.querySelector(".inquiry-backdrop").onclick=close;
dialog.querySelector(".inquiry-close").onclick=close;
dialog.querySelector("[data-inquiry-close]").onclick=close;
document.addEventListener("keydown",e=>{if(!dialog.hidden&&e.key==="Escape")close();});
photos.addEventListener("change",()=>{
  const files=[...photos.files].slice(0,5);
  $("inquiryFileList").textContent=files.length?files.map(f=>f.name).join(" · "):"";
  status.textContent=photos.files.length>5?"Please choose no more than five photos.":"";
});
document.addEventListener("click",event=>{
  const trigger=event.target.closest("[data-inquiry-type]");if(!trigger)return;
  event.preventDefault();
  const article=trigger.closest("[data-product-id]");
  open(trigger.dataset.inquiryType,trigger.dataset.productId||article?.dataset.productId||"",trigger.dataset.productTitle||article?.querySelector("h3")?.textContent?.trim()||"");
});
form.addEventListener("submit",async event=>{
  event.preventDefault();
  const submit=form.querySelector('[type="submit"]');submit.disabled=true;status.textContent="Sending securely…";
  try{
    const files=[...photos.files];
    if(files.length>5)throw new Error("Please choose no more than five photos.");
    for(const file of files){
      if(file.size>5*1024*1024)throw new Error(`${file.name} is larger than 5 MB.`);
    }
    const payload=new FormData();
    payload.set("inquiry_type",$("inquiryType").value);
    payload.set("product_id",$("inquiryProductId").value);
    payload.set("product_title",$("inquiryProductTitle").value);
    payload.set("name",$("inquiryName").value.trim());
    payload.set("email",$("inquiryEmail").value.trim());
    payload.set("phone",$("inquiryPhone").value.trim());
    payload.set("location",$("inquiryLocation").value.trim());
    payload.set("message",$("inquiryMessage").value.trim());
    payload.set("website",$("inquiryWebsite").value);
    payload.set("opened_at",String(openedAt));
    files.forEach(file=>payload.append("photos",file,file.name));
    const response=await fetch(`${SUPABASE_URL}/functions/v1/gallery-inquiry`,{method:"POST",headers:{apikey:SUPABASE_ANON_KEY},body:payload});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||"Unable to send right now. Please try again shortly.");
    form.hidden=true;$("inquirySuccess").hidden=false;
  }catch(error){status.textContent=error?.message||"Unable to send right now. Please email Olivejewelvintage@gmail.com.";}
  finally{submit.disabled=false;}
});
