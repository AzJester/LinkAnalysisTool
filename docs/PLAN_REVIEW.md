# LinkAnalysisTool: plan review

Reviewed 17 September 2026. Repository revision: [`960ec456048d21dfaa7e130614e265019babe6ce`](https://github.com/AzJester/LinkAnalysisTool/commit/960ec456048d21dfaa7e130614e265019babe6ce).

**Verdict: revise the plan before building.** Its choice of a separate calculation engine, map interface, background workers, cached geospatial data, and traceable reports is sound. It is not yet a complete or internally consistent plan for a public link budget application on st-dba.com. The most significant problems are public hosting assumptions, an incomplete acceptance fixture, ambiguous propagation-loss accounting, and an oversized first release.

This review covers all repository files, the current test suite, independent checks of the supplied DEM and parcel, and primary documentation for the principal external dependencies. The repository contains planning documents and test data, but no application, API, worker, frontend, deployment configuration, or terrain engine. The review does not validate an operating application or measured RF performance. The original repository files and expected values were left unchanged.

This is a historical review of the planning-only baseline. The companion [revised build plan](BUILD_PLAN.md) turns these findings into requirements. [Independent audit results](../tests/fixtures/waterfall_valley/independent_audit.json) preserve the fixture calculations. Current implementation and verification are described in the root README and VALIDATION.md.

## Findings that should block implementation as written

### 1. Public deployment is deferred even though it is a requirement now

**Priority: high.** The plan specifies single-user authentication at [line 303](https://github.com/AzJester/LinkAnalysisTool/blob/960ec456048d21dfaa7e130614e265019babe6ce/docs/BUILD_PLAN.md#L303), recommends local hosting at [lines 434-436](https://github.com/AzJester/LinkAnalysisTool/blob/960ec456048d21dfaa7e130614e265019babe6ce/docs/BUILD_PLAN.md#L434), and leaves remote access undecided at [line 464](https://github.com/AzJester/LinkAnalysisTool/blob/960ec456048d21dfaa7e130614e265019babe6ce/docs/BUILD_PLAN.md#L464).

For this project, public browser access on the owner's domain must be the deployment baseline. A small public calculation service also needs limits on expensive jobs, private job and artifact access, upload validation, retention rules, HTTPS, recovery after worker failure, backups, and a tested deployment procedure. Those are missing from the plan.

**Recommended deployment:** a standalone application at a proposed `linkbudget.st-dba.com`, linked from the main st-dba.com site, with its API under the same application's `/api` path. Use a Linux host for the Python API and workers, with private database/queue services and persistent raster storage. Docker Compose is a reasonable initial single-server deployment approach; it needs production configuration, not just a development compose file. [Docker production guidance](https://docs.docker.com/compose/how-tos/production/), [FastAPI deployment concepts](https://fastapi.tiangolo.com/deployment/concepts/).

If the final URL must be exactly `st-dba.com/tools/link-budget/`, serve the frontend there and route its API to the compute service. That depends on the current web host's static-file and reverse-proxy capabilities. The review did not establish those account capabilities, DNS permissions, or available server resources. Static hosting alone does not run this Python/PostGIS/worker stack. [GitHub Pages hosting model](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

The chosen stack can operate independently of ChatGPT. No ChatGPT login, OpenAI runtime, or conversational wrapper is needed for the application.

### 2. The acceptance fixture is not ready to be a binding correctness contract

**Priority: high.** The plan makes 80.7% coverage and 155 ft clearance mandatory acceptance values at [lines 390 and 412](https://github.com/AzJester/LinkAnalysisTool/blob/960ec456048d21dfaa7e130614e265019babe6ce/docs/BUILD_PLAN.md#L390). `CLAUDE.md` repeats the requirement. The supplied tests check arithmetic and file consistency; they do not calculate terrain visibility or link clearance.

**Verification performed:** all 12 existing pytest cases passed. I then independently opened the GeoTIFF with rasterio, calculated parcel areas on the WGS84 ellipsoid with pyproj, and rasterized the actual parcel-minus-inholding geometry using the raster's own transform.

| Check | Supplied expectation | Independent result | Assessment |
| --- | ---: | ---: | --- |
| Gross parcel area | 4,392 acres | 4,391.840 acres | Within tolerance |
| Inholding area | 161 acres | 161.178 acres | Within tolerance |
| Net parcel area | 4,231 acres | 4,230.662 acres | Within tolerance |
| Minimum / maximum elevation | 485 / 960 ft | 484.908 / 959.646 ft | Within tolerance |
| Cells inside net parcel | Exactly 19,430 | 19,004 with cell-center inclusion | Does not reproduce |
| Cells with any net-parcel overlap | No policy supplied | 19,562 with all-touched inclusion | Also does not explain 19,430 |
| Uncovered acres at 80.7% of 4,231 acres | 834 acres | 816.583 acres | Inconsistent denominator |
| Total acreage of eight listed shadow clusters | Narrative says eight clusters total 834 | Listed clusters sum to 577 | 257 acres unaccounted for |
| Candidate sites / backbone links | Narrative says nine / seven | Eight / six supplied | Inputs incomplete |

The 834-acre figure is especially revealing: `19,430 × 900 m² ÷ 4,046.8564224 × 19.3% = 833.978 acres`. That makes a cell-count denominator mismatch a plausible explanation, not an established reconstruction of the source workflow. The same nominal cell count implies approximately 4,321 acres, not 4,231.

The fixture also lacks the stand-class polygons/raster needed to reproduce its canopy clearances and coverage by forest stand. S9 is referenced in network expectations but has no site coordinates. The test module mentions `test_waterfall_valley.py`; that file does not exist in this revision. The actual cell spacing is approximately 30 m, but the stored CRS is EPSG:4326, so a future projected grid will need a separately specified baseline.

**Required correction:** preserve the historical expectations as source evidence. Recover or document the original mask, profile sampling and endpoint rules, land-class layer, S9, and any omitted shadow components. Store an explicit mask and provenance manifest. Establish a reconciled baseline through an explained change, rather than adjusting numbers until a new engine passes. Separate frozen regression tests from tests that fetch newer source data. No new terrain result was computed in this review, so 80.7% and 155 ft remain unverified.

### 3. The loss chain can charge the same obstruction twice

**Priority: high.** [Lines 175-179](https://github.com/AzJester/LinkAnalysisTool/blob/960ec456048d21dfaa7e130614e265019babe6ce/docs/BUILD_PLAN.md#L175) subtract generic path loss, clutter, rain, and gas. [Line 207](https://github.com/AzJester/LinkAnalysisTool/blob/960ec456048d21dfaa7e130614e265019babe6ce/docs/BUILD_PLAN.md#L207) then combines P.1812/ITM with P.2108 and P.833 without defining which effects the base model already contains.

These models are not interchangeable scalar loss providers. P.1812 accepts a terrain profile and representative clutter heights; its total loss must not receive a second generic charge for the same clutter. P.2108 methods also have specific terminal-environment assumptions. [Py1812 input/output contract](https://github.com/eeveetza/Py1812), [ITU-R P.2108](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.2108-1-202109-I%21%21PDF-E.pdf).

**Required correction:** give every model adapter a documented accounting contract: included mechanisms, permitted additional losses, applicable frequency/distance/height ranges, and reference tests. Keep the geometric surface separate from propagation inputs. For overlapping canopy and building heights measured above ground, the obstruction envelope ordinarily uses their maximum, not their sum; an existing DSM must not receive another canopy height addition.

For each direction of a link, explicitly define conducted transmit power, feeder losses, antenna gain toward the other endpoint, polarization loss, channel width, receiver sensitivity and its performance criterion. Distinguish watts, dBm, dB, dBi, ERP, and EIRP. Show noise/SNR or SINR when supported by actual inputs. Receiver sensitivity taken from a data sheet must not have its included noise figure charged a second time.

### 4. Availability and model versions need a stronger contract

**Priority: high for availability claims.** [Line 167](https://github.com/AzJester/LinkAnalysisTool/blob/960ec456048d21dfaa7e130614e265019babe6ce/docs/BUILD_PLAN.md#L167) calls for directly implementing P.530, while the general instructions prohibit writing propagation models from scratch. The plan does not pin recommendation editions or identify which P.530 procedures support each proposed frequency band.

ITU currently lists **P.530-19** as the in-force recommendation. ITU-Rpy's documentation lists implementations of **P.530-17 and -16**. Reusing the library can be sensible, but its edition and supported functions must be explicit, with validated differences before claiming current-method compliance. [ITU P.530 status](https://www.itu.int/rec/R-REC-P.530/en), [ITU-Rpy P.530 documentation](https://itu-rpy.readthedocs.io/en/latest/apidoc/itu530.html).

A P.1812 location percentage is not an annual link uptime percentage. P.530 worst-month multipath outputs need the specified conversion before being combined with annual rain outage. Use the required probability combination and applicability rules, not an unexplained sum of unrelated percentages. State whether reported availability excludes equipment failures, power, and network outages. Py1812's documented time parameter is limited to 1-50%; it is not a direct 99.99% availability input. [Py1812 documentation](https://github.com/eeveetza/Py1812).

Do not calculate availability for unsupported or obstructed paths merely because a positive received-signal margin exists. Return an explicit unavailable result until an appropriate model is implemented and validated.

### 5. The 6 GHz plan contradicts itself and merges different power classes

**Priority: high for the Wi-Fi release.** [Line 189](https://github.com/AzJester/LinkAnalysisTool/blob/960ec456048d21dfaa7e130614e265019babe6ce/docs/BUILD_PLAN.md#L189) bans all area coverage above 6 GHz, but the Wi-Fi section promises coverage across the 6 GHz Wi-Fi band. Its table at [lines 219-225](https://github.com/AzJester/LinkAnalysisTool/blob/960ec456048d21dfaa7e130614e265019babe6ce/docs/BUILD_PLAN.md#L219) also puts low-power indoor and very-low-power operation in one row.

LPI access points and VLP devices have different power limits: the FCC documents 30 dBm maximum EIRP and 5 dBm/MHz for LPI access points, versus 14 dBm and -5 dBm/MHz for VLP. Device role, bandwidth/PSD, sub-band, and operating conditions also matter. The 2026 GVP class adds another distinct regime. Use final adopted rules and their effective status, not the plan's January 8 announcement as the sole authority. [FCC LPI and standard-power table](https://docs.fcc.gov/public/attachments/FCC-21-100A1_Rcd.pdf), [FCC 26-1](https://docs.fcc.gov/public/attachments/FCC-26-1A1_Rcd.pdf).

**Required correction:** either defer 6 GHz area coverage or select and validate a model appropriate to its exact frequencies and path types. Do not extrapolate P.1812 above 6 GHz. Its documented minimum path distance also makes it unsuitable as an unchecked default for short outdoor Wi-Fi paths. Keep regulatory device classes separate. A planning calculation of exclusion polygons does not constitute AFC authorization or an approved geofencing implementation. [Py1812 validity limits](https://github.com/eeveetza/Py1812).

## Other corrections that materially affect the build

### Data access, coverage, and licensing

The assertion at [line 77](https://github.com/AzJester/LinkAnalysisTool/blob/960ec456048d21dfaa7e130614e265019babe6ce/docs/BUILD_PLAN.md#L77) that every listed source is free and covers the whole country is too broad.

| Plan assumption | Verified issue | Required change |
| --- | --- | --- |
| Annual NLCD covers 50 states | USGS identifies CONUS products; Alaska and Hawaii products are planned | Implement a regional coverage matrix and explicit fallback. [USGS Annual NLCD](https://www.usgs.gov/centers/eros/science/about-annual-nlcd) |
| All 3DEP heights are NAVD88 | USGS documents other vertical datums outside CONUS | Read each product's metadata; require compatible vertical references. [USGS DEM datums](https://www.usgs.gov/faqs/what-projection-horizontal-datum-vertical-datum-and-resolution-a-usgs-digital-elevation-model) |
| OpenTopography is an interchangeable free fallback | Keys, quotas, 1 m access conditions, and third-party application restrictions apply; the service also relies on USGS resources | Use compliant access, pre-staged official tiles, or cached results. Treat provider terms and source independence as implementation gates. [OpenTopography developer terms](https://opentopography.org/developers) |
| The linked NAIP-CHM record supplies a measured national raster | The record is a model/code archive and links separately to data downloads; canopy heights are model predictions | Build a real tile-discovery/download proof. Record prediction model, image vintage, scale, nodata and license. Do not equate 0.6 m pixels with measured accuracy. [NAIP-CHM record](https://zenodo.org/records/17664995) |
| Separating ITU wrappers resolves licensing | Py1812 separately identifies restrictions on redistribution of required ITU digital maps | Record software and data terms separately; review deployment and redistribution rights before packaging assets. [Py1812 digital products](https://github.com/eeveetza/Py1812) |

A service-level publication date is not necessarily the acquisition date of every terrain tile. A 1 m service pixel or a resampled output is not evidence of native 1 m terrain. Pin product identifiers and retrieval metadata. Key the raster cache by source version, horizontal and vertical references, resolution, grid alignment, resampling and geographic tile identity, not an AOI bounding-box hash alone.

Basemap tiles, imagery and geocoding also need providers, attribution, quotas and permitted-use terms. MapLibre is the renderer; it does not supply free production basemaps by itself. The budget must include hosting, storage, backups, bandwidth and any provider access, with cache quotas and eviction. The plan's broad four-month and effectively-zero-cost statements are estimates, not verified commitments.

### Regulatory screening inputs

The FAA DOF contains existing obstacles. Part 77 screening also needs airport/runway/heliport information and correct notice criteria. Add FAA NASR or another authoritative aeronautical source. Distinguish notice criteria from obstruction standards and final determinations; being near an airport is not itself a complete rule. [FAA DOF](https://www.faa.gov/air_traffic/flight_info/aeronav/obst_data/), [FAA NASR](https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/), [14 CFR 77.9](https://www.ecfr.gov/current/title-14/chapter-I/subchapter-E/part-77/subpart-B/section-77.9).

AFC and SAS integrations need actual provider access, device inputs, terms and a working integration test. Do not promise public production access based on possible developer tiers. ULS proximity is a useful screen, but a complete interference calculation also needs receiving and transmitting patterns, channels, selectivity, and sufficiently current records. ASR is not a transmitter inventory. The proposed RF-exposure feature needs a separate validated specification for applicability, geometry, multiple emitters and assessment method before it can label a boundary compliant.

### Scope and smaller engineering corrections

- Move the point-to-point budget, receiver threshold and useful export into the first public release. Site discovery, exhaustive networking, indoor AP placement, state statute tables and eight export formats are later products. The original minimum app is principally a viewshed tool, which does not yet satisfy the stated link budget need.
- Require network connectivity and usable backbone links when recommending multiple sites. Maximizing the union of their coverage masks alone does not prove a workable network.
- Change the greedy optimizer claim from an assumed "few percent" of optimum to a measured comparison on small exhaustive cases. Report the objective and whether an optimum was proven.
- Correct the earth-curvature example: using a 4/3 effective radius and a 6,371 km Earth radius, the midpoint bulge of a 40 mi path is approximately 200 ft, not 100 ft. Record the radius and refractivity assumptions.
- Do not use nominal 640-acre PLSS sections as exact surveyed area truth. Use synthetic known-area geometry and authoritative geometry with its actual area.
- Do not turn a generic 6-14 dB spread into a calibrated confidence band for every model and environment. Keep time variability, location variability, input uncertainty and field residuals distinct.
- Retain the useful source/version block in every export. Include model versions, processing grid, source dates, all run inputs and the application commit so a result can be reproduced.

## What is already worth keeping

Keep the clear distinction between geometric visibility and RF coverage; the isolated engineering engine; ellipsoidal geodesy and explicit units; background processing for area jobs; cached elevation; custom radio and antenna inputs; controlling-obstacle/Fresnel plots; deterministic report generation; and measurement import for later calibration. These give the revised plan a good foundation.

Resolve the fixture baseline and define the loss-accounting contract before implementing the corresponding calculations. Infrastructure capability, final hostname, tested resource limits and provider access remain deployment facts to establish. The proposed architecture can accommodate them.
