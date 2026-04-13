/**
 * build-nir-geo.js
 *
 * Generates GeoJSON files for the Negros Island Region (NIR) alignment.
 * NIR (PSGC 1800000000) comprises:
 *   - Negros Occidental (604500000) — formerly in Region VI
 *   - Negros Oriental  (704600000) — formerly in Region VII
 *   - Siquijor         (706100000) — formerly in Region VII
 *
 * Outputs in geo-nir/:
 *   country.0.001.json                       — 18-region national
 *   provdists-region-1800000000.0.001.json   — NIR province drilldown
 *   provdists-region-600000000.0.001.json    — R6 minus Negros Occidental
 *   provdists-region-700000000.0.001.json    — R7 minus Negros Or + Siquijor
 *
 * Run from repo root:  node scripts/build-nir-geo.js
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GEO_BASE = 'philippines-json-maps/2023/geojson';
const OUT      = 'geo-nir';
const TMP      = 'geo-nir/_tmp_combined.json';

const NIR_PSGC      = 1800000000;
const NIR_PROVINCES = new Set([604500000, 704600000, 706100000]);

// All region PSGCs present in the submodule
const REGION_PSGCS = [
  100000000, 200000000, 300000000, 400000000, 500000000,
  600000000, 700000000, 800000000, 900000000, 1000000000,
  1100000000, 1200000000, 1300000000, 1400000000, 1600000000,
  1700000000, 1900000000,
];

// Region names from the existing national file, plus NIR
const countryRaw  = JSON.parse(fs.readFileSync(`${GEO_BASE}/country/lowres/country.0.001.json`));
const regionNames = {};
for (const f of countryRaw.features) {
  regionNames[f.properties.adm1_psgc] = f.properties.adm1_en;
}
regionNames[NIR_PSGC] = 'Negros Island Region (NIR)';

// ── 1. Combine all province features ──────────────────────────────────────────
console.log('Reading province files…');
const allFeatures = [];
for (const rpsgc of REGION_PSGCS) {
  const file = `${GEO_BASE}/regions/lowres/provdists-region-${rpsgc}.0.001.json`;
  const data = JSON.parse(fs.readFileSync(file));
  for (const f of data.features) {
    const provPsgc = f.properties.adm2_psgc;
    // Assign nir_psgc: NIR provinces → NIR, all others keep their region
    f.properties.nir_psgc = NIR_PROVINCES.has(provPsgc) ? NIR_PSGC : rpsgc;
    allFeatures.push(f);
  }
}
console.log(`  ${allFeatures.length} province features combined`);

// Write temp combined file for mapshaper dissolve
fs.writeFileSync(TMP, JSON.stringify({ type: 'FeatureCollection', features: allFeatures }));

// ── 2. Dissolve provinces → regions using mapshaper ───────────────────────────
console.log('Dissolving regions with mapshaper…');
const mapshaperCmd = [
  'mapshaper',
  `"${TMP}"`,
  '-dissolve nir_psgc',
  `-o "${OUT}/_tmp_dissolved.json" format=geojson`,
].join(' ');
execSync(mapshaperCmd, { stdio: 'inherit' });

// ── 3. Post-process: rename field, add adm1_en names ─────────────────────────
console.log('Post-processing dissolved output…');
const dissolved = JSON.parse(fs.readFileSync(`${OUT}/_tmp_dissolved.json`));
for (const f of dissolved.features) {
  const psgc = f.properties.nir_psgc;
  f.properties.adm1_psgc = psgc;
  f.properties.adm1_en   = regionNames[psgc] || String(psgc);
  f.properties.geo_level  = 'Reg';
  delete f.properties.nir_psgc;
}
fs.writeFileSync(`${OUT}/country.0.001.json`, JSON.stringify(dissolved));
console.log(`  → ${OUT}/country.0.001.json  (${dissolved.features.length} regions)`);

// ── 4. NIR province drilldown file ────────────────────────────────────────────
console.log('Generating NIR province file…');
const nirFeatures = allFeatures
  .filter(f => NIR_PROVINCES.has(f.properties.adm2_psgc))
  .map(f => {
    const out = JSON.parse(JSON.stringify(f));
    out.properties.adm1_psgc = NIR_PSGC;
    out.properties.adm1_en   = regionNames[NIR_PSGC];
    delete out.properties.nir_psgc;
    return out;
  });
fs.writeFileSync(
  `${OUT}/provdists-region-${NIR_PSGC}.0.001.json`,
  JSON.stringify({ type: 'FeatureCollection', features: nirFeatures })
);
console.log(`  → ${OUT}/provdists-region-${NIR_PSGC}.0.001.json  (${nirFeatures.length} provinces)`);

// ── 5. Modified R6 (without Negros Occidental) ───────────────────────────────
console.log('Generating modified R6 file…');
const r6Raw  = JSON.parse(fs.readFileSync(`${GEO_BASE}/regions/lowres/provdists-region-600000000.0.001.json`));
const r6Feat = r6Raw.features.filter(f => f.properties.adm2_psgc !== 604500000);
fs.writeFileSync(
  `${OUT}/provdists-region-600000000.0.001.json`,
  JSON.stringify({ type: 'FeatureCollection', features: r6Feat })
);
console.log(`  → ${OUT}/provdists-region-600000000.0.001.json  (${r6Feat.length} provinces, was ${r6Raw.features.length})`);

// ── 6. Modified R7 (without Negros Oriental + Siquijor) ──────────────────────
console.log('Generating modified R7 file…');
const r7Raw  = JSON.parse(fs.readFileSync(`${GEO_BASE}/regions/lowres/provdists-region-700000000.0.001.json`));
const r7Feat = r7Raw.features.filter(f => f.properties.adm2_psgc !== 704600000 && f.properties.adm2_psgc !== 706100000);
fs.writeFileSync(
  `${OUT}/provdists-region-700000000.0.001.json`,
  JSON.stringify({ type: 'FeatureCollection', features: r7Feat })
);
console.log(`  → ${OUT}/provdists-region-700000000.0.001.json  (${r7Feat.length} provinces, was ${r7Raw.features.length})`);

// ── 7. Cleanup temp files ─────────────────────────────────────────────────────
fs.unlinkSync(TMP);
fs.unlinkSync(`${OUT}/_tmp_dissolved.json`);
console.log('Done.');
