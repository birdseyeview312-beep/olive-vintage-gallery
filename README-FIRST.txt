Olive Vintage Gallery — Desktop Product Image Fill (v23)

Upload these 3 files to the repository root and replace the existing files:
- index.html
- collection.html
- product-image-fill.css

What this fixes:
- Product photos fill the entire desktop image placeholder.
- Removes the oversized white/empty areas around portrait and oddly sized listing photos.
- Applies to Homepage New Arrivals and the full Collection page.
- Featured two-column cards also fill correctly.
- Mobile presentation is intentionally left unchanged.
- Lightbox/original gallery images are not changed.

This uses CSS object-fit: cover on desktop, so the very outer edges of some source photos may crop slightly in order to fill the card cleanly.
