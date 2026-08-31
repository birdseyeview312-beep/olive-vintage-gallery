import { supabase } from "./supabase-client.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
const $=id=>document.getElementById(id);
const e={loginPanel:$("loginPanel"),dashboardApp:$("dashboardApp"),loginForm:$("loginForm"),loginEmail:$("loginEmail"),loginPassword:$("loginPassword"),loginMessage:$("loginMessage"),signOutBtn:$("signOutBtn"),sessionEmail:$("sessionEmail"),overviewStats:$("overviewStats"),inventoryCardStatus:$("inventoryCardStatus"),auctionCardStatus:$("auctionCardStatus"),videoCardStatus:$("videoCardStatus"),privateViewingCardStatus:$("privateViewingCardStatus"),paymentCardStatus:$("paymentCardStatus"),ordersCardStatus:$("ordersCardStatus"),inquiryCardStatus:$("inquiryCardStatus"),ownerSessionLabel:$("ownerSessionLabel"),forgotPasswordBtn:$("forgotPasswordBtn")};
let session=null;
const isAdmin=()=>session?.user?.app_metadata?.olive_role==="admin";
async function functionGet(slug){const {data:{session:s}}=await supabase.auth.getSession();if(!s?.access_token)throw new Error("Owner session expired");const r=await fetch(`${SUPABASE_URL}/functions/v1/${slug}`,{headers:{Authorization:`Bearer ${s.access_token}`,apikey:SUPABASE_ANON_KEY}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error||"Connection check failed");return data;}
async function loadDashboard(){
  e.ownerSessionLabel.textContent="Secure · Admin";
  const [productsRes,eventsRes,lotsRes,regsRes,webOrdersRes,privateSessionsRes,privateRequestsRes,inquiriesRes]=await Promise.all([
    supabase.from("products").select("id,status,price",{count:"exact"}),
    supabase.from("auction_events").select("id,status,published",{count:"exact"}),
    supabase.from("auction_lots").select("id,status,current_bid",{count:"exact"}),
    supabase.from("auction_registrations").select("auction_id,user_id",{count:"exact"}),
    supabase.from("web_orders").select("id,status,fulfillment_status",{count:"exact"}),
    supabase.from("private_viewing_sessions").select("id,status",{count:"exact"}),
    supabase.from("private_viewing_requests").select("id,status",{count:"exact"}),
    supabase.from("gallery_inquiries").select("id,status,inquiry_type",{count:"exact"})
  ]);
  const products=productsRes.data||[],events=eventsRes.data||[],lots=lotsRes.data||[],privateSessions=privateSessionsRes.data||[],privateRequests=privateRequestsRes.data||[];
  const available=products.filter(x=>x.status==="available").length,drafts=products.filter(x=>x.status==="draft").length,sold=products.filter(x=>x.status==="sold").length;
  const activeAuctions=events.filter(x=>["scheduled","live"].includes(x.status)).length,liveLots=lots.filter(x=>x.status==="live").length,soldLots=lots.filter(x=>x.status==="sold").length;
  const webOrders=webOrdersRes.data||[],paidWebOrders=webOrders.filter(x=>x.status==="paid").length,unfulfilledWebOrders=webOrders.filter(x=>x.status==="paid"&&x.fulfillment_status!=="completed").length;
  const newPrivateRequests=privateRequests.filter(x=>x.status==="new").length,openPrivateSessions=privateSessions.filter(x=>["scheduled","live"].includes(x.status)).length;
  const inquiries=inquiriesRes.data||[],newInquiries=inquiries.filter(x=>x.status==="new").length;
  e.overviewStats.innerHTML=`<div class="overview-stat"><span>Total inventory</span><strong>${productsRes.count??products.length}</strong><small>${available} available · ${drafts} draft</small></div><div class="overview-stat"><span>Auction events</span><strong>${eventsRes.count??events.length}</strong><small>${activeAuctions} scheduled/live</small></div><div class="overview-stat"><span>Private viewings</span><strong>${openPrivateSessions}</strong><small>${newPrivateRequests} new request${newPrivateRequests===1?"":"s"}</small></div><div class="overview-stat"><span>Completed sales</span><strong>${sold}</strong><small>${paidWebOrders} web · ${soldLots} auction</small></div>`;
  e.inventoryCardStatus.textContent=`${productsRes.count??products.length} records · ${drafts} drafts`;
  e.auctionCardStatus.textContent=`${eventsRes.count??events.length} events · ${liveLots} live lots`;
  e.privateViewingCardStatus.textContent=`${openPrivateSessions} open room${openPrivateSessions===1?"":"s"} · ${newPrivateRequests} new request${newPrivateRequests===1?"":"s"}`;
  e.ordersCardStatus.textContent=paidWebOrders||soldLots?`${paidWebOrders} web order${paidWebOrders===1?"":"s"} · ${soldLots} auction win${soldLots===1?"":"s"}${unfulfilledWebOrders?` · ${unfulfilledWebOrders} to fulfill`:""}`:"No completed sales yet";
  e.inquiryCardStatus.textContent=`${newInquiries} new · ${inquiries.length} total`;
  Promise.allSettled([functionGet("square-settings"),functionGet("cloudflare-settings")]).then(results=>{const p=results[0].status==="fulfilled"?results[0].value:null;const v=results[1].status==="fulfilled"?results[1].value:null;e.paymentCardStatus.textContent=p?.configured?`Square connected · ${p.mode==="live"?"Live":"Sandbox"}`:"Square not connected";e.videoCardStatus.textContent=v?.configured?"Cloudflare connected":"Cloudflare not connected";});
}
function render(){const ok=isAdmin();e.loginPanel.classList.toggle("hidden",ok);e.dashboardApp.classList.toggle("hidden",!ok);e.signOutBtn.classList.toggle("hidden",!session);e.sessionEmail.textContent=session?.user?.email||"";if(session&&!ok)e.loginMessage.textContent="This account does not have Olive Vintage owner access.";if(ok){e.loginMessage.textContent="";loadDashboard();}}
e.loginForm.addEventListener("submit",async ev=>{ev.preventDefault();e.loginMessage.textContent="Signing in…";const {error}=await supabase.auth.signInWithPassword({email:e.loginEmail.value.trim(),password:e.loginPassword.value});e.loginMessage.textContent=error?error.message:"";});
e.forgotPasswordBtn?.addEventListener("click",async()=>{const email=e.loginEmail.value.trim();if(!email){e.loginMessage.textContent="Enter the owner email above, then tap Forgot password again.";e.loginEmail.focus();return;}e.forgotPasswordBtn.disabled=true;e.loginMessage.textContent="Sending a secure password-reset email…";try{const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/`});if(error)throw error;e.loginMessage.textContent="Password-reset email sent. Open it when you have access to the inbox, then follow the link to choose a new password.";}catch(error){e.loginMessage.textContent=error?.message||"Unable to send the reset email right now.";}finally{e.forgotPasswordBtn.disabled=false;}});
e.signOutBtn.onclick=async()=>{await supabase.auth.signOut();location.href="./dashboard.html";};
async function boot(){const {data:{session:s}}=await supabase.auth.getSession();session=s;render();supabase.auth.onAuthStateChange((_event,next)=>{session=next;render();});}
boot();
