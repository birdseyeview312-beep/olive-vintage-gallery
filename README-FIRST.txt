OLIVE VINTAGE GALLERY — PRIVATE 1-ON-1 GALLERY VIEWING v1
============================================================

WHAT IS ALREADY LIVE IN SUPABASE
--------------------------------
The backend has already been added to the live Olive Vintage Supabase project:
- private_viewing_requests table
- private_viewing_sessions table
- owner-only RLS policies
- hashed invitation tokens
- one-collector guest lease (prevents a copied invite from opening on another device)
- private-viewing-access Edge Function v2
- appointment request rate limiting / honeypot protection

Do NOT re-run the SQL just to install this version. The files under /supabase are included as source-control/reference copies of what is already live.

FILES TO ADD AT THE WEBSITE ROOT
--------------------------------
private-viewing.html
private-viewing.css
private-viewing.js
private-viewing-room.html
private-viewing-room.css
private-viewing-room.js

FILES TO ADD / REPLACE INSIDE /admin
------------------------------------
ADD:
admin/private-viewings.html
admin/private-viewings.css
admin/private-viewings.js

REPLACE the current files with the versions in this package:
admin/dashboard.html
admin/dashboard.js

WHAT THE NEW OWNER DASHBOARD DOES
---------------------------------
1. Shows new private viewing requests.
2. Lets the owner turn a request into a scheduled session.
3. Generates a long private invitation link.
4. Does NOT store the raw invite link in the database; only its SHA-256 hash is stored.
5. Lets the owner regenerate an invite if another copy is needed.
6. Opens an owner camera room from a phone.
7. Lets the owner switch front/rear camera, mute audio, turn camera off, chat, and end the session.
8. Loads the live Olive Vintage inventory and lets the owner spotlight an exact product during the call.
9. The collector can press Buy Now in the private room and use the existing PayPal checkout flow.

CUSTOMER URLS AFTER DEPLOYMENT
------------------------------
Booking/request page:
https://www.olivevintage.store/private-viewing.html

Invitation links are created by the owner dashboard and look like:
https://www.olivevintage.store/private-viewing-room.html?invite=<long-private-token>

OWNER URL AFTER DEPLOYMENT
--------------------------
https://www.olivevintage.store/admin/private-viewings.html

or open Owner Dashboard and tap the new PRIVATE VIEWINGS card.

FIRST REAL TEST
---------------
Use two different phones/networks if possible.

OWNER PHONE:
1. Sign into the Owner Dashboard.
2. Open Private Viewings.
3. Create a test session.
4. Copy the customer invitation link.
5. Tap Enter Owner Room.
6. Allow camera + microphone.

CUSTOMER PHONE:
1. Open the invitation link.
2. Allow camera + microphone.
3. Confirm two-way audio/video.
4. Owner switches to rear camera and walks the gallery.
5. Owner spotlights one product.
6. Confirm the customer sees product photo/title/maker/price and Buy Now.
7. End the test session from the owner phone.

IMPORTANT VIDEO RELIABILITY NOTE
--------------------------------
This v1 uses encrypted browser WebRTC with STUN and Supabase Realtime only for signaling/chat.
That means the video itself is peer-to-peer and private.

A dedicated TURN relay is NOT connected yet. Most normal home/mobile network combinations can connect directly, but certain corporate Wi-Fi, restrictive routers, and some carrier network combinations may fail.

Before publicly advertising the service to all collectors, the recommended next upgrade is to connect a TURN/WebRTC provider (for example LiveKit Cloud, Daily, Twilio Network Traversal, Cloudflare TURN, or another dedicated TURN service). The room code is structured so ICE/TURN servers can be returned by the existing private-viewing-access function without redesigning the UI.

PUBLIC HOMEPAGE LINK
--------------------
The feature works without a public homepage link because customer rooms are invitation-only.
For the booking page to be discoverable, add this link to the main navigation in index.html and collection.html after testing:

<a href="./private-viewing.html">Private Viewing</a>

A copy of this note is also in HOMEPAGE-LINK-PATCH.txt.
