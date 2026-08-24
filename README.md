# Olive Vintage Gallery — Owner Dashboard + Buy Now Checkout V5

Production-ready static website build for **www.olivevintage.store**.

## Included in this build

- Existing award-polish Olive Vintage Gallery homepage
- Mobile hero continuity fix
- Corrected **Purple Optic Vase** product name
- Crisp hero artwork already used by the current site
- New homepage **Live Auctions** invitation
- New `/auction.html` live auction room
- New `/auction-terms.html` bidder terms page
- Bidder passwordless email sign-in UI
- Per-auction bidder registration
- Real-time lot updates with a polling fallback
- Server-authoritative bidding in Supabase
- Anti-sniping soft close (default: 15 seconds)
- Auction lot catalog and photo galleries
- Private `/admin/auctions.html` Auction Manager
- Private `/admin/payments.html` owner-controlled PayPal settings
- Private `/admin/video.html` owner-controlled Mux live-video settings
- Public **Buy Now** buttons for available, priced products
- Secure PayPal approval/capture flow through the `paypal-checkout` Edge Function
- Automatic short reservation during checkout and sold status after capture
- Private website order tracking and fulfillment status in `/admin/orders.html`
- One-button Mux broadcast creation from Auction Manager
- Existing `/admin/admin.html` Gallery Manager, now restricted to the Olive admin role

## Live Supabase backend

The auction schema is already installed in the connected Olive Vintage Supabase project. Do **not** rerun the old starter SQL in `admin/supabase.sql` against the live project.

Tables used by the auction system:

- `auction_events`
- `auction_lots`
- `auction_registrations`
- `auction_bids`

Bid validation runs in the database inside a locked transaction. The client cannot directly raise the current bid on a lot. One live lot is allowed per auction. Moving a linked lot to `live` reserves an available gallery product; moving it to `sold` marks the gallery product sold.

## Before the first public auction

1. In Supabase Auth URL Configuration, set the production Site URL to `https://www.olivevintage.store` and allow `https://www.olivevintage.store/auction.html` for passwordless sign-in redirects.
2. In Auction Manager, set the event date/time, add lots, confirm every lot's photos, and choose whether bidder approval is required.
3. Add a supported live video embed URL (YouTube, Vimeo, or Mux player/embed URL).
4. Connect PayPal Business credentials in Owner Settings → Payments and test them before enabling priced products for Buy Now.
5. Keep the event unpublished until the catalog, terms, video, payment flow, and shipping policy are ready.

## Deployment

This remains a static site and can be deployed through the existing GitHub → Vercel setup. Upload/commit the contents of this build over the current project, preserving the file structure.

## Owner-controlled PayPal setup
The delivered site contains no PayPal Client ID or Client Secret. After handoff, an Olive Vintage administrator can open `admin/payments.html` (Owner Settings → Payments), choose Sandbox or Live, and enter their PayPal credentials. The browser sends those credentials to the authenticated `paypal-settings` Supabase Edge Function; the function verifies owner/admin access and stores the credentials encrypted in Supabase Vault. The Client Secret is never returned to the browser after saving. The owner can test the connection directly against PayPal or disconnect/replace it without editing website code.

## Owner-controlled live video (Mux)
The delivered site contains no Mux Token ID, Token Secret, or stream key. After handoff, an Olive Vintage administrator can open `admin/video.html` (Owner Settings → Live Video) and enter a Mux Access Token with **Mux Video Read + Write** permission. The Token Secret is encrypted in Supabase Vault and never returned to the browser after saving.

Inside `admin/auctions.html`, each saved auction now has a **Mux Live Video** panel. The owner can:

- create a low-latency Mux broadcast for that auction,
- automatically attach the Mux Player URL to the public auction room,
- retrieve the owner-only RTMPS server and stream key for OBS or a compatible broadcaster,
- copy the broadcaster values,
- check whether Mux is receiving an active signal.

The stream key is stored in encrypted Vault storage and is not kept in the public `auction_events` table. The public site receives only the safe playback URL. Bids and countdowns remain server-authoritative in Supabase and do not depend on video timing.

### Going live
1. Connect Mux in **Owner Settings → Live Video**.
2. In **Auction Manager**, save/select the auction and press **Create Mux Broadcast**.
3. In OBS or a compatible mobile broadcaster, use the RTMPS server and Stream Key shown in the private manager.
4. Start the broadcaster, then press **Check Signal**. When Mux reports `active`, the public auction player is live.
5. Keep the auction bidding clock in Supabase as the source of truth; do not close lots based on what is heard in the video feed.


## V4 Owner Dashboard
- Public navigation no longer exposes the manager; a discreet **Owner Login** link lives in the footer.
- `/admin/dashboard.html` is the single owner entry point and includes its own secure sign-in form.
- Dashboard links to Inventory, Auctions, Live Video, Payments, Orders & Winners, and Settings & Security.
- Orders & Winners surfaces website PayPal orders plus sold auction lots, winning amounts, bidder aliases, and private buyer/winner contact information available to the owner.
- Website Buy Now checkout is now wired server-side. Auction-winner payment collection can reuse the same secure PayPal foundation in the next checkout layer.
- Settings & Security lets the signed-in owner change their own password and manage service connections.


## V5 Website Buy Now checkout
- `web_orders` is installed in the live Supabase database with admin-only RLS.
- `paypal-checkout` is deployed as a public checkout Edge Function. It accepts only an artwork ID or PayPal order ID; prices are always re-read and validated server-side.
- Starting checkout reserves an available artwork for 12 minutes to reduce double-selling. Expired reservations are released automatically the next time checkout/order cleanup runs.
- PayPal credentials are read only from encrypted Vault storage through service-role-only RPCs.
- Successful capture marks the order paid and the product sold. Customer card/PayPal credentials are never stored by Olive Vintage Gallery.
- `checkout-success.html` confirms the capture and returns the buyer to the gallery.
- The owner can track paid website orders and set fulfillment to Unfulfilled, Processing, Shipped, or Completed.


## Owner password recovery
- The private Owner Login now includes **Forgot password?**.
- It sends Supabase's official recovery email only when the owner taps it.
- Recovery links return to the production site and automatically route the owner to **Settings & Security** to choose a new password.


## v7 photo-first storefront update
- Live homepage inventory now prioritizes available products with verified recovered photos.
- Products awaiting original images remain in Supabase/admin and are not deleted.
- Sold/draft visibility rules remain controlled by existing Supabase RLS/status logic.

## v8 mobile polish
- Mobile New Acquisitions uses 4:3 product frames so product details appear sooner.
- Reduced vertical spacing in Recently Selected on phones.
- Added stronger horizontal overflow protection.
- Desktop layout remains unchanged.

## v9 mobile precision polish
- Shortens mobile product artwork frames from 4:3 to 3:2.
- Reduces oversized marketplace product titles on phones.
- Improves the New Acquisition overlay with a translucent, high-contrast label.
- Tightens product information spacing so price, title, maker and checkout controls appear sooner.
- Leaves desktop/tablet presentation unchanged.

## v10 — Full Collection + Product Photo Gallery
- Homepage product images are clickable when an original image is available.
- Full-screen lightbox supports next/previous, keyboard arrows, mobile swipe, photo counter and thumbnails.
- New `collection.html` shows the full public catalog rather than only the 10 homepage highlights.
- Available and Sold Archive filters are populated live from Supabase.
- Draft/ended/unresolved records remain hidden from shoppers by existing RLS.


## v11 Unlimited Collection Loader
The public collection now paginates through Supabase in 10-row batches until no more public records remain. There is no fixed catalog limit; the loader also guards against repeated backend pages to avoid accidental infinite request loops.


## v12 — Unlimited homepage inventory
- Removed the hard-coded `.slice(0, 10)` homepage cutoff.
- Homepage now renders every public available/reserved product returned by the unlimited paginated loader.
- Products with recovered photography remain prioritized first.
- Existing image lightbox, full Collection page, checkout, dashboard, and mobile styling are unchanged.
