import { getGalleryProducts, formatProductForExistingUI } from "./gallery-data.js";

async function loadFeaturedCollection() {
  const rows = await getGalleryProducts({ featured: true, limit: 8 });
  const products = rows.map(formatProductForExistingUI);

  // Replace this line with your existing product-card rendering function.
  console.log("Featured Olive Vintage Gallery products:", products);
}

loadFeaturedCollection();
