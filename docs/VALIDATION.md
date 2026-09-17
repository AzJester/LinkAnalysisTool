# Validation and fixture reconciliation

Version 1.0 is a deterministic point-to-point free-space budget and sampled clearance tool. Automated checks exercise the actual engine and API. They do not establish measured RF performance, full area coverage or annual availability.

## Current checks

`tests/test_engine.py` checks Friis known values (92.44778322 dB at 1 GHz over 1 km), distance/frequency doubling, Fresnel radius, WGS84 equatorial distance, directional asymmetry, losses, thermal noise, blocked paths, off-grid obstacles, clutter envelope policy, both-height adjustment, profile rounding and invalid inputs. The 40-mile effective-Earth bulge at k = 4/3 is approximately 200 ft.

`tests/test_api.py` checks real ASGI requests for complete runs, capability isolation, cancellation, expiry, request rates, chunked oversized bodies, missing terrain, forbidden fields and path limits. `tests/test_terrain.py` checks index-before-sampling, batching, cache reuse, nodata, gaps, mixed datums and retries. Frontend tests check CSV units/order/nodata and spreadsheet formula escaping.

The original 12 tests in `test_fixture_consistency.py` remain historical arithmetic checks, not engine acceptance. No nonexistent test_waterfall_valley.py is implied.

## Historical data remains immutable

The original narrative is in [HISTORICAL_VALIDATION.md](HISTORICAL_VALIDATION.md), with supplied expected_results.json values intact. [Independent audit results](../tests/fixtures/waterfall_valley/independent_audit.json) record reproducible geometry and accounting checks.

| Item | Independent check | Disposition |
| --- | --- | --- |
| Gross / inholding / net area | 4,391.840 / 161.178 / 4,230.662 acres, WGS84 geodesic area | Reproduces rounded areas |
| Net DEM mask, cell centers | 19,004 cells | Original 19,430 not reproduced |
| Net DEM mask, all touched | 19,562 cells | Also not 19,430 |
| Parcel elevation extrema | 484.908 / 959.646 ft | Reproduces 485 / 960 ft |
| Uncovered at 80.7% of 4,231 acres | 816.583 acres | Conflicts with 834 acres |
| Listed shadow clusters | 577 acres | Incomplete uncovered inventory |
| Stand classes and candidate S9 | Missing from supplied data | Original optimizer/coverage cannot be reconstructed |
| S3-S4 historical 155 ft clearance | Endpoint handling and exact profile conventions unspecified | Not a validated baseline |

19,430 cells times 900 square meters gives 4,321.132 acres; 19.3% of that is 833.978 acres. This suggests a denominator mismatch, but the original computation is unavailable to prove it. EPSG:4326 pixels must not simply be treated as identical 900 square meter squares.

## Live integration evidence, 17 September 2026

The actual S3-S4 coordinates (34.62537, -87.88113) to (34.63375, -87.85460) were run through the application against USGS:

- WGS84 path: 2,604.308488 m.
- 262 samples at approximately 10 m spacing, with complete response and coverage-index query.
- Two products: 1 m AL_17County_2020_B20 (84 samples) and 1/9 arc-second AL_Colbert_LauderdaleCos_2011 (178 samples). Both identify NAVD88.
- At 45.72 m AGL on both ends, minimum geometric clearance including endpoints is 45.72 m (150 ft). The original 155 ft claim cannot hold under this endpoint-inclusive definition. Its conventions need reconstruction.
- Illustrative 5.8 GHz radios, 27 dBm TX, 23 dBi gains, 1 dB feeders and -75 dBm sensitivity give approximately -45.0 dBm received power and 30.0 dB nominal margin.
- Initial local live retrieval took approximately 1.3 seconds; API working memory was approximately 60 MB after the example. These are local measurements, not performance guarantees for the free host.

Live data may change and is not a deterministic CI fixture. Full calculation JSON preserves exact samples, sources, model version and commit. Before coverage/availability releases, add independent reference vectors and reconstruct missing historical inputs. Never invent missing land cover, sites or outage percentages.
