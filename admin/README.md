# Olive Vintage Gallery — Gallery Manager

This package adds a real inventory/admin layer without redesigning the luxury public website.

## What it manages

- Artwork title, maker/artist, category, origin, period/date and medium
- Dimensions
- Price
- Available / Reserved / Sold / Draft status
- Description, condition and provenance
- Multiple product photographs
- Featured Piece flag
- New Arrival flag
- Inquire to Purchase flag
- Search and status filtering
- Simple inventory statistics
- Private email/password admin login

## Cloud architecture

The manager uses Supabase for:
- Postgres inventory database
- Supabase Auth for the private admin login
- Supabase Storage for product images

The browser uses only the public/anon project key. Security comes from Row Level Security policies in `supabase.sql`.
Never put a Supabase service-role key into this website.

## Setup

1. Create a Supabase project.
2. Open `supabase.sql`.
3. Replace every `CHANGE-ME@example.com` with the email you want to use as the Gallery Manager administrator.
4. Run the SQL in the Supabase SQL Editor.
5. In Storage, create a **public** bucket named `product-images`.
6. In Authentication, create the administrator user using the same email used in the SQL policies.
7. Open `config.js` and replace:
   - `YOUR_SUPABASE_PROJECT_URL`
   - `YOUR_SUPABASE_ANON_KEY`
8. Add these files to the same website deployment.
9. Visit `/admin.html` and sign in.

## Connect the existing public gallery

Your old `products.js` can be replaced gradually.

Import:
```js
import { getGalleryProducts, formatProductForExistingUI } from "./gallery-data.js";
```

Then:
```js
const rows = await getGalleryProducts({ status: "available" });
const products = rows.map(formatProductForExistingUI);
```

Use `products` in your existing gallery-card renderer.

Featured section:
```js
const featured = await getGalleryProducts({ featured: true, limit: 4 });
```

New arrivals:
```js
const newArrivals = await getGalleryProducts({ newArrival: true, limit: 8 });
```

Sold archive:
```js
const sold = await getGalleryProducts({ status: "sold" });
```

## Security note

`supabase.sql` permits public reading of Available, Reserved and Sold records, but it restricts database writes and photo uploads to the single administrator email you specify.

Before launch, test:
- anonymous visitor cannot insert/update/delete records
- admin can add/edit/delete records
- draft records are not visible to anonymous visitors
- product image uploads work
- public images load on the gallery
