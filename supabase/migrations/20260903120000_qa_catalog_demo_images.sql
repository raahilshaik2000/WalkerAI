-- Backfill demo images for QA design-tool catalog SKUs so admin supplier
-- catalog Photo column is non-empty during client walkthroughs.
UPDATE public.supplier_catalog
SET image_urls = ARRAY[
  'https://picsum.photos/seed/' || sku || '/640/640'
]::text[]
WHERE sku LIKE 'QA-%'
  AND (
    image_urls IS NULL
    OR cardinality(image_urls) = 0
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(image_urls) AS u(url)
      WHERE url IS NOT NULL AND length(trim(url)) > 0
    )
  );
