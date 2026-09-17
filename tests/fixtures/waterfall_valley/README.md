# Waterfall Valley acceptance fixture

Colbert County, Alabama. A 4,231 acre parcel analyzed by hand on 17 September 2026. This is the regression fixture for the terrain and coverage engine, and the Phase 0 acceptance test.

See `docs/VALIDATION.md` for the narrative version and the tolerances.

## Files

| File | What it is |
| --- | --- |
| `WaterfallValley_DEM_30m_meters.tif` | 3DEP bare-earth elevation, 30 m grid, 272 x 363 cells, meters, EPSG:4326 |
| `WaterfallValley_Elevation_KeyPoints.csv` | 78 named points: 8 candidate sites, 47 boundary vertices, GNIS summits, parcel high and low |
| `parcel.geojson` | Outer boundary (47 vertices) and the excluded 161 acre inholding |
| `expected_results.json` | Every assertion, with its tolerance |

## What the source analysis used

3DEP bare earth on a 30 m grid. Viewshed with a 4/3 effective earth radius. Ground receiver at 6.5 ft AGL. Tower heights 100 ft and 150 ft. Canopy assigned by forest stand type: 80 ft hardwood, 65 ft pine, 3 ft open.

## Internal consistency, verified

Two parts of the fixture are pure arithmetic and were recomputed from first principles rather than trusted:

- **Fresnel.** All 18 values of 60 % F1 at mid-path (6 links x 3 bands) reproduce from `F1 = 17.32*sqrt(d1*d2/(f*D))` to within 1 ft.
- **Geometry.** All 6 link distances and azimuths reproduce from the site coordinates by Vincenty inverse on WGS84, within 0.004 mi and 0.5 degrees.

`tests/test_fixture_consistency.py` runs both. They need no engine code, so this suite is green from an empty repo.

## What should NOT match

Two results are expected to diverge, and the difference is a finding rather than a failure:

1. **Over-canopy coverage.** The source assigned canopy heights by stand type from a map. The tool samples a measured 0.6 m canopy height model. The tool's numbers should be better. Record both.
2. **Boundary geometry.** The source boundary was traced from a map image at roughly 15 m positioning error. A surveyed or imported boundary shifts areas slightly.

## Provenance

Elevation: USGS 3DEP, data current to 24 August 2026, NAVD88. Boundary: traced from a broker map figure and checked against BLM CadNSDI PLSS sections for T5S R12W and R13W, Huntsville Meridian. Not a survey. Treat coordinates as good to roughly 50 ft.
