# Olive Vintage Gallery — Rebuild

This is a fresh reconstruction of the Olive Vintage Gallery website using the supplied olive/red-gem artwork as the primary brand image.

## Included

- Luxury responsive homepage
- Intro/loading brand reveal
- Olive/red-gem brand integration in:
  - opening screen
  - site header
  - hero
  - signature brand section
  - contact section
  - footer
- Contemporary / Vintage & Antique / American / European collection presentation
- New acquisitions section
- Gallery story and contact area
- Responsive mobile navigation
- Scroll reveal animation and subtle orbit motion
- Gallery Manager folder copied into `/admin`

## Preview

Open `index.html` in a browser.

For the Gallery Manager:
- configure `/admin/config.js`
- run `/admin/supabase.sql` in your Supabase project
- create the `product-images` bucket
- create your admin user
- visit `/admin/admin.html`

## Important

The public homepage currently uses elegant placeholder glass forms in the collection/product sections.
These are intentionally placeholders until your actual inventory photographs are added through the Gallery Manager.

## Next development step

Connect the public product grid to Supabase so artwork entered in the Gallery Manager automatically appears on the live site.

## Deployment

This folder can be deployed to a static host such as Netlify, Vercel, Cloudflare Pages or similar.
Then point `olivevintage.store` to that deployment through the domain DNS settings.
