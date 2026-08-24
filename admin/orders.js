import { supabase } from "./supabase-client.js";
const $=id=>document.getElementById(id);
const e={accessPanel:$("accessPanel"),accessMessage:$("accessMessage"),ordersApp:$("ordersApp"),sessionEmail:$("sessionEmail"),signOutBtn:$("signOutBtn"),webOrdersList:$("webOrdersList"),auctionOrdersList:$("auctionOrdersList"),webOrderCount:$("webOrderCount"),winnerCount:$("winnerCount")};
let session=null;
const isAdmin=()=>session?.user?.app_metadata?.olive_role==="admin";
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
function money(v){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(v||0));}
function when(v){return v?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(v)):"—";}

async function loadWebOrders(){
  const {data,error}=await supabase.from("web_orders").select("id,product_id,paypal_order_id,status,fulfillment_status,amount,currency,buyer_email,buyer_name,paid_at,created_at,products(title,inventory_number)").order("created_at",{ascending:false});
  if(error){e.webOrdersList.innerHTML=`<p class="message">${esc(error.message)}</p>`;return;}
  const rows=data||[];e.webOrderCount.textContent=rows.filter(x=>x.status==="paid").length;
  if(!rows.length){e.webOrdersList.innerHTML='<div class="empty-state"><div class="eyebrow">NO WEB ORDERS YET</div><h2>Buy Now orders will appear here.</h2><p>When a customer completes PayPal checkout, the artwork is marked sold and the order is added automatically.</p></div>';return;}
  e.webOrdersList.innerHTML=`<div class="order-row header"><span>Order</span><span>Artwork / Buyer</span><span>Amount</span><span>Payment</span><span>Fulfillment</span></div>`+rows.map(o=>{
    const product=Array.isArray(o.products)?o.products[0]:o.products;
    const orderRef=(o.paypal_order_id||o.id||"").slice(-10);
    const options=["unfulfilled","processing","shipped","completed"].map(v=>`<option value="${v}" ${o.fulfillment_status===v?"selected":""}>${v[0].toUpperCase()+v.slice(1)}</option>`).join("");
    return `<div class="order-row"><strong>${esc(orderRef)}</strong><div><strong>${esc(product?.title||"Gallery artwork")}</strong><div class="order-subline">${esc(product?.inventory_number||"")} ${o.buyer_name?`· ${esc(o.buyer_name)}`:""}</div><div class="buyer-email optional-col">${esc(o.buyer_email||"Buyer email available in PayPal")}</div></div><div class="amount">${money(o.amount)}</div><div class="optional-col"><span class="status-chip ${o.status}">${esc(o.status)}</span><div class="order-subline">${esc(when(o.paid_at||o.created_at))}</div></div><div class="optional-col">${o.status==="paid"?`<select class="fulfillment-select" data-order="${o.id}">${options}</select>`:`<span class="muted">${esc(o.fulfillment_status)}</span>`}</div></div>`;
  }).join("");
  e.webOrdersList.querySelectorAll("[data-order]").forEach(select=>select.onchange=async()=>{
    select.disabled=true;
    const {error}=await supabase.from("web_orders").update({fulfillment_status:select.value}).eq("id",select.dataset.order);
    if(error){alert(error.message);await loadWebOrders();}else select.disabled=false;
  });
}

async function loadAuctionWinners(){
  const {data:lots,error}=await supabase.from("auction_lots").select("id,auction_id,lot_number,title,current_bid,current_bidder_alias,status").eq("status","sold").order("updated_at",{ascending:false});
  if(error){e.auctionOrdersList.innerHTML=`<p class="message">${esc(error.message)}</p>`;return;}
  const sold=lots||[];e.winnerCount.textContent=sold.length;
  if(!sold.length){e.auctionOrdersList.innerHTML='<div class="empty-state"><div class="eyebrow">NO WINNERS YET</div><h2>Sold auction lots will appear here.</h2><p>Once a live lot is closed as sold, its winning amount and bidder details will be available to the owner.</p></div>';return;}
  const auctionIds=[...new Set(sold.map(x=>x.auction_id))],lotIds=sold.map(x=>x.id);
  const [{data:events},{data:bids}]=await Promise.all([
    supabase.from("auction_events").select("id,title").in("id",auctionIds),
    supabase.from("auction_bids").select("lot_id,amount,bidder_alias,bidder_email,created_at").in("lot_id",lotIds).order("amount",{ascending:false})
  ]);
  const eventMap=new Map((events||[]).map(x=>[x.id,x.title]));const winners=new Map();
  for(const b of bids||[]){if(!winners.has(b.lot_id))winners.set(b.lot_id,b);}
  e.auctionOrdersList.innerHTML=`<div class="order-row header"><span>Lot</span><span>Item / Auction</span><span>Winning Bid</span><span>Winner</span><span>Contact</span></div>`+sold.map(l=>{const w=winners.get(l.id);return `<div class="order-row"><strong>#${l.lot_number}</strong><div><strong>${esc(l.title)}</strong><div class="muted">${esc(eventMap.get(l.auction_id)||"Auction")}</div></div><div class="amount">${money(l.current_bid)}</div><div class="optional-col">${esc(w?.bidder_alias||l.current_bidder_alias||"—")}</div><div class="winner-email optional-col">${esc(w?.bidder_email||"—")}</div></div>`}).join("");
}

async function loadOrders(){await Promise.all([loadWebOrders(),loadAuctionWinners()]);}
function render(){const ok=isAdmin();e.accessPanel.classList.toggle("hidden",ok);e.ordersApp.classList.toggle("hidden",!ok);e.signOutBtn.classList.toggle("hidden",!session);e.sessionEmail.textContent=session?.user?.email||"";if(session&&!ok)e.accessMessage.textContent="This signed-in account does not have Olive Vintage owner access.";if(ok)loadOrders();}
e.signOutBtn.onclick=async()=>{await supabase.auth.signOut();location.href="./dashboard.html";};
async function boot(){const{data:{session:s}}=await supabase.auth.getSession();session=s;render();supabase.auth.onAuthStateChange((_event,next)=>{session=next;render();});}
boot();
