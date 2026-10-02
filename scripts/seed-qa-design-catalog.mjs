#!/usr/bin/env node
/**
 * Seeds sample in-stock supplier_catalog SKUs for the QA supplier so the
 * homeowner Design & Materials step has real products to pick.
 *
 * Usage:
 *   QA_SUPPLIER_PASSWORD='…' node scripts/seed-qa-design-catalog.mjs
 *
 * Reads SUPABASE_URL + SUPABASE_ANON_KEY from .env.
 * Idempotent on SKU for the QA supplier.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const repoRoot = process.cwd();
const envPath = path.join(repoRoot, '.env');
const SUPPLIER_EMAIL = 'qa-supplier@walkerai.app';

const PRODUCTS = [
  {
    sku: 'QA-CAB-SHAKER-W',
    name: 'Shaker Cabinet Set — Soft White',
    description: 'QA sample kitchen cabinet package for design-tool testing.',
    category: 'Cabinets & Storage',
    brand: 'Walker QA',
    unit: 'set',
    price_per_unit: 480000,
    quality_tier: 'mid-range',
    image_urls: ['https://picsum.photos/seed/QA-CAB-SHAKER-W/640/640'],
  },
  {
    sku: 'QA-CT-QUARTZ-CAL',
    name: 'Calacatta Quartz Slab',
    description: 'QA sample countertop SKU.',
    category: 'Countertops & Surfaces',
    brand: 'Walker QA',
    unit: 'sqft',
    price_per_unit: 9500,
    quality_tier: 'luxury',
    image_urls: ['https://picsum.photos/seed/QA-CT-QUARTZ-CAL/640/640'],
  },
  {
    sku: 'QA-TILE-PORC-24',
    name: 'Porcelain Floor Tile 24×24',
    description: 'QA sample flooring / backsplash SKU.',
    category: 'Tile & Flooring',
    brand: 'Walker QA',
    unit: 'sqft',
    price_per_unit: 650,
    quality_tier: 'mid-range',
    image_urls: ['https://picsum.photos/seed/QA-TILE-PORC-24/640/640'],
  },
  {
    sku: 'QA-PLUMB-FAUCET-MB',
    name: 'Matte Black Kitchen Faucet',
    description: 'QA sample plumbing fixture.',
    category: 'Plumbing Fixtures',
    brand: 'Walker QA',
    unit: 'units',
    price_per_unit: 28900,
    quality_tier: 'mid-range',
    image_urls: ['https://picsum.photos/seed/QA-PLUMB-FAUCET-MB/640/640'],
  },
  {
    sku: 'QA-PAINT-SOFT-W',
    name: 'Interior Paint — Soft White',
    description: 'QA sample wall covering for design-tool walls surface.',
    category: 'Paint & Wall Coverings',
    brand: 'Walker QA',
    unit: 'gallon',
    price_per_unit: 5400,
    quality_tier: 'budget',
    image_urls: ['https://picsum.photos/seed/QA-PAINT-SOFT-W/640/640'],
  },
  {
    sku: 'QA-HARD-PULL-BN',
    name: 'Brushed Nickel Cabinet Pull',
    description: 'QA sample hardware SKU.',
    category: 'Hardware & Fixtures',
    brand: 'Walker QA',
    unit: 'units',
    price_per_unit: 1800,
    quality_tier: 'mid-range',
    image_urls: ['https://picsum.photos/seed/QA-HARD-PULL-BN/640/640'],
  },
];

const SUPPLIER_CATEGORIES = [
  'Cabinets & Storage',
  'Countertops & Surfaces',
  'Tile & Flooring',
  'Plumbing Fixtures',
  'Paint & Wall Coverings',
  'Hardware & Fixtures',
  'Other',
];

function readEnvValue(name) {
  if (!fs.existsSync(envPath)) return null;
  const source = fs.readFileSync(envPath, 'utf8');
  const match = source.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match?.[1]?.trim()?.replace(/^["']|["']$/g, '') || null;
}

async function main() {
  const url = readEnvValue('SUPABASE_URL') || readEnvValue('EXPO_PUBLIC_SUPABASE_URL');
  const anon =
    readEnvValue('SUPABASE_ANON_KEY') ||
    readEnvValue('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const password = process.env.QA_SUPPLIER_PASSWORD;

  if (!url || !anon) {
    console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }
  if (!password) {
    console.error('Set QA_SUPPLIER_PASSWORD to the qa-supplier account password.');
    process.exit(1);
  }

  const supabase = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: SUPPLIER_EMAIL,
    password,
  });
  if (authError || !authData.user) {
    console.error('Supplier login failed:', authError?.message ?? 'no user');
    process.exit(1);
  }

  const { data: supplier, error: supplierError } = await supabase
    .from('suppliers')
    .select('id, categories')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (supplierError || !supplier?.id) {
    console.error('Supplier profile missing:', supplierError?.message ?? 'no row');
    process.exit(1);
  }

  await supabase
    .from('suppliers')
    .update({ categories: SUPPLIER_CATEGORIES })
    .eq('id', supplier.id);

  let upserted = 0;
  for (const item of PRODUCTS) {
    const { data: existing } = await supabase
      .from('supplier_catalog')
      .select('id')
      .eq('supplier_id', supplier.id)
      .eq('sku', item.sku)
      .maybeSingle();

    const row = {
      supplier_id: supplier.id,
      name: item.name,
      description: item.description,
      category: item.category,
      sku: item.sku,
      brand: item.brand,
      unit: item.unit,
      price_per_unit: item.price_per_unit,
      quality_tier: item.quality_tier,
      lead_time_days: 5,
      in_stock: true,
      stock_quantity: 25,
      image_urls: item.image_urls,
    };

    if (existing?.id) {
      const { error } = await supabase.from('supplier_catalog').update(row).eq('id', existing.id);
      if (error) {
        console.error(`update ${item.sku}:`, error.message);
        process.exit(1);
      }
    } else {
      const { error } = await supabase.from('supplier_catalog').insert(row);
      if (error) {
        console.error(`insert ${item.sku}:`, error.message);
        process.exit(1);
      }
    }
    upserted += 1;
  }

  const { count } = await supabase
    .from('supplier_catalog')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', supplier.id)
    .eq('in_stock', true);

  console.log(`OK: upserted ${upserted} design SKUs for ${SUPPLIER_EMAIL}`);
  console.log(`In-stock catalog rows for this supplier: ${count ?? '?'}`);
  await supabase.auth.signOut();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
