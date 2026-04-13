# ph-drilldown-map

An interactive choropleth map of the Philippines with drill-down navigation. Connect any dataset by editing a single JSON file — no build step, no backend.

Users navigate from the national view down through regions, provinces, and municipalities. How deep they can go, and what data appears in the detail panel, is entirely up to you.

---

## Demo

A live demo is published to GitHub Pages automatically on every push to `main`. To enable it on your fork:

1. Go to **Settings → Pages**
2. Set **Source** to **GitHub Actions**
3. Push to `main` — the workflow in `.github/workflows/pages.yml` handles the rest

The workflow does a sparse checkout of only the ~10 MB of geo files the map actually uses, skipping the 1.7 GB full submodule.

---

## Local setup

```bash
git clone <this-repo>
git submodule update --init   # pulls geo data (~1.7 GB, one-time)
python -m http.server 8080
# open http://localhost:8080/index.html
```

Browsers block `fetch()` from `file://` URLs, so a local HTTP server is required. Any static file server works — Python's is the simplest.

---

## How it works

1. On load, `index.html` fetches `data.json` and builds an index of your records by PSGC code
2. It loads GeoJSON boundaries from the `philippines-json-maps/` submodule at runtime
3. Polygons with a matching data record are filled using your color scale; unmatched polygons use the default theme color
4. Clicking a polygon either drills deeper or opens the detail panel, depending on `maxDepth`

All configuration and data lives in `data.json`. The map file itself has no domain logic.

---

## Connecting your data

Copy `data.example.json` to `data.json` and edit it. The map re-reads it on every page load.

Each record in your dataset needs a `psgc` field — the Philippine Standard Geographic Code for that area. Everything else is yours to define.

```json
{
  "title": "Poverty Incidence by Province",
  "description": "2021 Family Income and Expenditure Survey results.",
  "maxDepth": "province",
  "colorField": "poverty_rate",
  "colorDomain": [0, 60],
  "colorScheme": "interpolateOranges",
  "detailFields": [
    { "key": "poverty_rate", "label": "Poverty Rate (%)" },
    { "key": "population",   "label": "Population" },
    { "key": "source",       "label": "Source" }
  ],
  "data": {
    "region": [],
    "province": [
      { "psgc": 1500000000, "poverty_rate": 48.1, "population": 3456789, "source": "PSA 2021" },
      { "psgc": 9700000000, "poverty_rate": 39.4, "population": 1234567, "source": "PSA 2021" }
    ],
    "municity": []
  }
}
```

You only need to populate the levels you're using. Empty arrays are fine for unused levels.

---

## Drill depth (`maxDepth`)

`maxDepth` controls how deep users can navigate and where clicking a polygon opens the detail panel.

### `"region"` — regional overview

Users click a region on the national map and see its data immediately. No drill-in.

**Good for:** national-level comparisons, regional scorecards, indicators that are only available at the regional level.

```json
{
  "maxDepth": "region",
  "data": {
    "region": [
      { "psgc": 100000000,  "value": 74 },
      { "psgc": 200000000,  "value": 61 },
      { "psgc": 1300000000, "value": 88 }
    ],
    "province": [],
    "municity": []
  }
}
```

### `"province"` — province-level drill

Clicking a region zooms into its provinces. Clicking a province opens the detail panel.

**Good for:** provincial data (LGU performance, health indicators, election results), cases where municipality-level data isn't available or needed.

```json
{
  "maxDepth": "province",
  "data": {
    "region": [],
    "province": [
      { "psgc": 12800000, "value": 83, "rank": 1 },
      { "psgc": 13600000, "value": 71, "rank": 5 }
    ],
    "municity": []
  }
}
```

You can provide region-level data alongside province data. Region polygons will be colored during the national view, and province polygons will be colored after drilling in.

### `"municity"` — full drill-through (default)

Users can navigate all the way to individual cities and municipalities. The detail panel opens automatically when a municipality is clicked.

**Good for:** barangay services, municipal LGU data, business registrations, anything with city/municipality granularity.

```json
{
  "maxDepth": "municity",
  "data": {
    "region": [],
    "province": [],
    "municity": [
      { "psgc": 1380600000, "value": 92, "category": "Top performer" },
      { "psgc": 1380300000, "value": 87, "category": "Top performer" }
    ]
  }
}
```

You can mix levels — color regions on the national view, provinces on the regional view, and municipalities on the province view, all from the same map.

---

## Configuration reference

| Field | Default | Description |
|-------|---------|-------------|
| `title` | `"Philippines Map"` | Page title and welcome panel heading |
| `description` | *(none)* | Introductory text in the welcome panel |
| `maxDepth` | `"municity"` | Deepest navigable level: `"region"`, `"province"`, or `"municity"` |
| `geoBasePath` | `"./philippines-json-maps"` | Path to geo data directory |
| `colorField` | *(none)* | Field in data records used for polygon fill color |
| `colorDomain` | `[0, 100]` | `[min, max]` for the color scale; values outside are clamped |
| `colorScheme` | `"interpolateBlues"` | D3 sequential interpolator name |
| `detailFields` | `[]` | Fields to show in the detail panel: `[{ "key": "...", "label": "..." }]` |
| `data.region` | `[]` | Records joined to region polygons by `psgc` |
| `data.province` | `[]` | Records joined to province/district polygons by `psgc` |
| `data.municity` | `[]` | Records joined to city/municipality polygons by `psgc` |

---

## Color scheme

Set `colorScheme` to any [D3 sequential interpolator](https://d3js.org/d3-scale-chromatic/sequential). The scale maps `colorDomain[0]` to the lightest color and `colorDomain[1]` to the darkest.

```
interpolateBlues     interpolateGreens    interpolateOranges
interpolateReds      interpolatePurples   interpolateYlOrRd
interpolateViridis   interpolatePlasma    interpolateMagma
interpolateInferno   interpolateCool      interpolateWarm
```

Polygons with no matching data record use the default fill from the theme (dark blue in dark mode, light blue in light mode).

---

## PSGC codes

Every area in the Philippines has a Philippine Standard Geographic Code — a 10-digit integer. Your data records must use the same PSGC values used in the [faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps) dataset.

**Quick reference for regions:**

| Region | PSGC |
|--------|------|
| Ilocos Region (Region I) | `100000000` |
| Cagayan Valley (Region II) | `200000000` |
| Central Luzon (Region III) | `300000000` |
| CALABARZON (Region IV-A) | `400000000` |
| MIMAROPA (Region IV-B) | `1700000000` |
| Bicol Region (Region V) | `500000000` |
| Western Visayas (Region VI) | `600000000` |
| Central Visayas (Region VII) | `700000000` |
| Eastern Visayas (Region VIII) | `800000000` |
| Zamboanga Peninsula (Region IX) | `900000000` |
| Northern Mindanao (Region X) | `1000000000` |
| Davao Region (Region XI) | `1100000000` |
| SOCCSKSARGEN (Region XII) | `1200000000` |
| NCR | `1300000000` |
| CAR | `1400000000` |
| CARAGA (Region XIII) | `1600000000` |
| BARMM | `1900000000` |

For province and municipality codes, the [PSA PSGC publication](https://psa.gov.ph/classification/psgc) is the authoritative source. The GeoJSON files in `philippines-json-maps/` also embed PSGC values in their feature properties (`adm1_psgc`, `adm2_psgc`, `adm3_psgc`).

---

## Detail panel

`detailFields` controls what appears in the side panel when a user selects an area. Each entry maps a field key in your data record to a display label.

```json
"detailFields": [
  { "key": "poverty_rate", "label": "Poverty Rate (%)" },
  { "key": "rank",         "label": "Provincial Rank" },
  { "key": "year",         "label": "Reference Year" }
]
```

Fields where the value is `null` or missing from the record are automatically omitted. If a record has no fields or the area has no data record, the panel shows "No data for this area."

---

## File structure

```
index.html                       — self-contained application (HTML + CSS + JS)
data.json                      — your config and dataset; edit this
data.example.json              — fully annotated schema reference
philippines-json-maps/         — geo data git submodule (faeldon/philippines-json-maps)
.github/workflows/pages.yml    — GitHub Actions workflow for Pages deployment
```

`index.html` has no build dependencies beyond the D3 CDN. To deploy, copy `index.html`, `data.json`, and the `philippines-json-maps/` directory to any static file host.
