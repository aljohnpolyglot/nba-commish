// Run with: npx tsx scripts/test-sponsor-catalog.ts
import {
  loadSponsorCatalog,
  getSponsorCatalogSync,
  pickSponsorName,
  getBrandMeta,
} from '../src/data/sponsorCatalogFetcher';

async function main() {
  // 1. Sync getter returns null before load
  if (getSponsorCatalogSync() !== null) throw new Error('cache should start null');

  // 2. Offline fallback path: pickSponsorName works even before fetch resolves
  const beforeFetchName = pickSponsorName('spain', 'S', 'kit');
  if (typeof beforeFetchName !== 'string' || beforeFetchName.length === 0) {
    throw new Error('pickSponsorName must return a string before fetch resolves');
  }

  // 3. Load real catalog (or fall back if offline)
  const catalog = await loadSponsorCatalog();
  if (catalog.version === undefined) throw new Error('catalog must have a version');
  if (!catalog.leagues.spain) throw new Error('spain league must be populated');

  // 4. Cache populated
  if (getSponsorCatalogSync() === null) throw new Error('cache should be populated after load');

  // 5. pickSponsorName respects exclusion
  const first = pickSponsorName('spain', 'S', 'kit', null);
  for (let i = 0; i < 30; i++) {
    const next = pickSponsorName('spain', 'S', 'kit', first);
    if (next === first) throw new Error(`pickSponsorName must exclude existing: got ${next} same as ${first}`);
  }

  // 6. getBrandMeta returns undefined for unknown brand
  if (getBrandMeta('spain', '__nonexistent__') !== undefined) {
    throw new Error('unknown brand should return undefined');
  }

  console.log('PASS: sponsor catalog fetcher');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
