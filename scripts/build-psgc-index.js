/**
 * build-psgc-index.js
 *
 * Generates psgc-index.json — a developer reference listing all regions,
 * provinces/districts, and municipalities/cities with their PSGCs and
 * parent hierarchy, covering both the NIR and standard region alignments.
 *
 * Run from repo root:  node scripts/build-psgc-index.js
 */

const fs = require('fs');

const GEO_BASE = 'philippines-json-maps/2023/geojson';

// Province PSGCs whose region assignment differs between NIR and standard
const NIR_PROVINCE_PSGCS  = new Set([604500000, 704600000, 706100000]);
const NIR_REGION_PSGC     = 1800000000;
const NIR_REGION_NAME     = 'Negros Island Region (NIR)';
const STANDARD_REGION_MAP = {
  604500000: { psgc: 600000000, name: 'Region VI (Western Visayas)' },
  704600000: { psgc: 700000000, name: 'Region VII (Central Visayas)' },
  706100000: { psgc: 700000000, name: 'Region VII (Central Visayas)' },
};

// All region PSGCs in the submodule
const REGION_PSGCS = [
  100000000, 200000000, 300000000, 400000000, 500000000,
  600000000, 700000000, 800000000, 900000000, 1000000000,
  1100000000, 1200000000, 1300000000, 1400000000, 1600000000,
  1700000000, 1900000000,
];

// ── Regions ───────────────────────────────────────────────────────────────────
const countryRaw  = JSON.parse(fs.readFileSync(`${GEO_BASE}/country/lowres/country.0.001.json`));
const regionNameMap = {};
for (const f of countryRaw.features) {
  regionNameMap[f.properties.adm1_psgc] = f.properties.adm1_en;
}
regionNameMap[NIR_REGION_PSGC] = NIR_REGION_NAME;

// Standard: 17 regions as-is
const regionsStandard = countryRaw.features.map(f => ({
  psgc: f.properties.adm1_psgc,
  name: f.properties.adm1_en,
})).sort((a, b) => a.psgc - b.psgc);

// NIR: same list but swap R6/R7 for NIR
const nirCountryRaw = JSON.parse(fs.readFileSync('geo-nir/country.0.001.json'));
const regionsNir = nirCountryRaw.features.map(f => ({
  psgc: f.properties.adm1_psgc,
  name: f.properties.adm1_en,
})).sort((a, b) => a.psgc - b.psgc);

// ── Provinces / Districts ─────────────────────────────────────────────────────
const provinces = [];
for (const rpsgc of REGION_PSGCS) {
  const file = `${GEO_BASE}/regions/lowres/provdists-region-${rpsgc}.0.001.json`;
  const data = JSON.parse(fs.readFileSync(file));
  for (const f of data.features) {
    const { adm2_psgc, adm2_en, geo_level } = f.properties;
    const isNirProvince = NIR_PROVINCE_PSGCS.has(adm2_psgc);

    const entry = {
      psgc:        adm2_psgc,
      name:        adm2_en,
      type:        geo_level === 'Dist' ? 'District' : 'Province',
      region_psgc: isNirProvince ? NIR_REGION_PSGC : rpsgc,
      region_name: isNirProvince ? NIR_REGION_NAME  : regionNameMap[rpsgc],
    };

    if (isNirProvince) {
      entry.region_psgc_standard = STANDARD_REGION_MAP[adm2_psgc].psgc;
      entry.region_name_standard = STANDARD_REGION_MAP[adm2_psgc].name;
    }

    provinces.push(entry);
  }
}
provinces.sort((a, b) => a.psgc - b.psgc);

// Build province lookup for municity enrichment
const provLookup = {};
for (const p of provinces) provLookup[p.psgc] = p;

// ── Municipalities / Cities ───────────────────────────────────────────────────
const municities = [];
const seen = new Set();

// From province municipality files
const lowresDir = `${GEO_BASE}/provdists/lowres`;
const medresDir = `${GEO_BASE}/provdists/medres`;

for (const file of fs.readdirSync(lowresDir)) {
  const data = JSON.parse(fs.readFileSync(`${lowresDir}/${file}`));
  if (!data.features) continue; // skip malformed files (e.g. empty GeometryCollection)
  for (const f of data.features) {
    const { adm2_psgc, adm3_psgc, adm3_en, geo_level } = f.properties;
    if (seen.has(adm3_psgc)) continue;
    seen.add(adm3_psgc);
    const prov = provLookup[adm2_psgc];
    municities.push({
      psgc:         adm3_psgc,
      name:         adm3_en,
      type:         geo_level,
      province_psgc: adm2_psgc,
      province_name: prov ? prov.name : null,
      region_psgc:  prov ? prov.region_psgc : null,
      region_name:  prov ? prov.region_name : null,
    });
  }
}

// NCR municipalities come from medres district files (not in lowres provdists)
const NCR_DISTRICT_PSGCS = [1303900000, 1307400000, 1307500000, 1307600000];
for (const dpsgc of NCR_DISTRICT_PSGCS) {
  const file = `${medresDir}/municities-provdist-${dpsgc}.0.01.json`;
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file));
  for (const f of data.features) {
    const { adm2_psgc, adm3_psgc, adm3_en, geo_level } = f.properties;
    if (seen.has(adm3_psgc)) continue;
    seen.add(adm3_psgc);
    const prov = provLookup[adm2_psgc];
    municities.push({
      psgc:          adm3_psgc,
      name:          adm3_en,
      type:          geo_level,
      province_psgc: adm2_psgc,
      province_name: prov ? prov.name : null,
      region_psgc:   1300000000,
      region_name:   regionNameMap[1300000000],
    });
  }
}

// HUC cities from huc-boundaries.json (geographically independent cities)
const hucData = JSON.parse(fs.readFileSync('huc-boundaries.json'));
for (const f of hucData.features) {
  const { adm1_psgc, adm3_psgc, adm3_en, parent_prov_psgc } = f.properties;
  if (seen.has(adm3_psgc)) continue;
  seen.add(adm3_psgc);
  const prov = provLookup[parent_prov_psgc];
  // For NIR: Bacolod's region is NIR, not R6
  const isNirProvince = NIR_PROVINCE_PSGCS.has(parent_prov_psgc);
  municities.push({
    psgc:          adm3_psgc,
    name:          adm3_en,
    type:          'City',
    province_psgc: parent_prov_psgc,
    province_name: prov ? prov.name : null,
    region_psgc:   isNirProvince ? NIR_REGION_PSGC : adm1_psgc,
    region_name:   isNirProvince ? NIR_REGION_NAME  : regionNameMap[adm1_psgc],
  });
}

municities.sort((a, b) => a.psgc - b.psgc);

// ── Write output ──────────────────────────────────────────────────────────────
const index = {
  _note: [
    'PSGC index generated from philippines-json-maps (2023) and huc-boundaries.json.',
    'Region assignments use the NIR alignment by default (index.html).',
    'For the 3 NIR provinces, region_psgc_standard and region_name_standard give the standard alignment (index-no-nir.html).',
    'NCR municipalities are listed under their district PSGCs (not provinces).',
    'HUC cities are listed under their geographic parent province PSGC.',
  ],
  regions: {
    nir:      regionsNir,
    standard: regionsStandard,
  },
  provinces,
  municities,
};

fs.writeFileSync('psgc-index.json', JSON.stringify(index, null, 2));

console.log(`Done.`);
console.log(`  regions (NIR):      ${regionsNir.length}`);
console.log(`  regions (standard): ${regionsStandard.length}`);
console.log(`  provinces:          ${provinces.length}`);
console.log(`  municities:         ${municities.length}`);
