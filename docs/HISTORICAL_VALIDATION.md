# Validation

The engine is validated against a hand-built analysis of a 4,231 acre parcel in Colbert County, Alabama, completed 17 September 2026. That analysis is the acceptance test for Phase 0 and the permanent regression fixture for the terrain and coverage engine.

## The acceptance case

**Area of interest.** Parcel boundary, 47 vertices, roughly 34.5893 N to 34.6461 N and 87.8992 W to 87.8199 W. An inholding of 161 acres is excluded from the net area. Colbert County, Alabama. T5S R12W and R13W, Huntsville Meridian.

**Run parameters.** 3DEP bare-earth elevation on a 30 m grid, 272 columns by 363 rows, 98,736 cells. Viewshed with a 4/3 effective earth radius. Canopy modeled by stand type at 80 ft hardwood, 65 ft pine, 3 ft open. Tower heights 100 ft and 150 ft. Ground receiver at 6.5 ft AGL.

## Expected results

| Measure | Expected | Tolerance |
| --- | --- | --- |
| Area inside outer boundary | 4,392 acres | 0.5 % |
| Net area after inholding | 4,231 acres | 0.5 % |
| East-west extent | 4.52 mi (7.27 km) | 0.5 % |
| North-south extent | 3.92 mi (6.30 km) | 0.5 % |
| Boundary perimeter | 17.1 mi (27.5 km) | 1 % |
| Centroid | 34.6188 N, 87.8591 W | 50 ft |
| Parcel low point | 485 ft at 34.62834 N, 87.85034 W | 1 ft |
| Parcel high point | 960 ft at 34.59564 N, 87.82447 W | 1 ft |
| Median elevation | 735 ft | 2 ft |
| Mean elevation | 719 ft | 2 ft |
| Cells inside net parcel | 19,430 | exact |

### Single-site coverage, ground receiver 6.5 ft AGL

Percent of the 4,231 acre net parcel with terrain line of sight, at 100 ft / 150 ft tower height.

| Site | Elev ft | Lat N | Lon W | Ground LOS | Air 200 ft AGL |
| --- | --- | --- | --- | --- | --- |
| S1 SE plateau | 948 | 34.59645 | 87.82840 | 49 / 51 % | 88 / 89 % |
| S2 NW ridge | 881 | 34.63213 | 87.87425 | 56 / 60 % | 90 / 92 % |
| S3 West plateau | 906 | 34.62537 | 87.88113 | 56 / 60 % | 91 / 93 % |
| S4 Timber Knob E spur | 863 | 34.63375 | 87.85460 | 54 / 60 % | 91 / 94 % |
| S5 Central ridge | 846 | 34.60861 | 87.83593 | 49 / 52 % | 87 / 89 % |
| S6 Timber Knob summit | 872 | 34.64456 | 87.86279 | 47 / 52 % | 86 / 89 % |
| S7 N-central spur | 814 | 34.63131 | 87.86181 | 51 / 57 % | 88 / 91 % |
| S8 SE high point | 960 | 34.59564 | 87.82447 | 46 / 49 % | 87 / 88 % |

Tolerance: 1 percentage point.

### Network coverage, S1 + S3 + S4

| Stand type | Acres | 100 ft towers | 150 ft towers |
| --- | --- | --- | --- |
| Whole parcel | 4,231 | 76.8 % | 80.7 % |
| Valley hardwood | 1,826 | 53 % | 61 % |
| Planted pine | 1,551 | 97 % | 98 % |
| 1-yr plantation | 290 | 99 % | 99 % |
| Harvested | 554 | 90 % | 92 % |

The optimizer must independently select S1, S3, S4 as the best trio at both tower heights, and must find S1+S2+S4 as an equal-scoring alternate at 80.7 %.

Air coverage: S3 plus S4 alone must reach 96.9 % of the parcel for an aircraft at 200 ft AGL at 150 ft tower height, and 94.6 % at 100 ft.

### Backbone links, both ends at 150 ft AGL (100 ft in parentheses)

| Link | Distance | Azimuth | Min clearance, terrain | Min clearance, canopy |
| --- | --- | --- | --- | --- |
| S3 to S4 | 1.62 mi (2.60 km) | 69 deg | 155 ft (105 ft) | 152 ft (102 ft) |
| S4 to S1 | 2.97 mi (4.78 km) | 150 deg | 155 ft (105 ft) | 124 ft (74 ft) |
| S3 to S1 | 3.61 mi (5.80 km) | 124 deg | 163 ft (113 ft) | 160 ft (110 ft) |
| S1 to S5 | 0.94 mi (1.52 km) | 333 deg | 162 ft (112 ft) | 159 ft (109 ft) |
| S4 to S5 | 2.03 mi (3.27 km) | 148 deg | 151 ft (100 ft) | 118 ft (69 ft) |
| S3 to S2 | 0.61 mi (0.98 km) | 40 deg | 160 ft (110 ft) | 95 ft (45 ft) |

Tolerance: 3 ft on clearance, 1 degree on azimuth, 0.02 mi on distance.

### Fresnel

60 % of the first Fresnel zone at mid-path, in feet:

| Link | 900 MHz | 2.4 GHz | 5.8 GHz |
| --- | --- | --- | --- |
| S3 to S4 (2.60 km) | 29 | 18 | 11 |
| S4 to S1 (4.78 km) | 39 | 24 | 15 |
| S3 to S1 (5.80 km) | 43 | 27 | 17 |
| S1 to S5 (1.52 km) | 22 | 14 | 9 |
| S4 to S5 (3.27 km) | 33 | 20 | 13 |
| S3 to S2 (0.98 km) | 18 | 11 | 7 |

These are exact arithmetic and must match to the foot. The formula is:

```
F1 = 17.32 * sqrt(d1 * d2 / (f * D))
```

with distances in km, frequency in GHz, result in meters. At mid-path this reduces to `17.32 * sqrt(D / (4f))`. Worked check for S3 to S4 at 900 MHz: `17.32 * sqrt(2.60 / 3.6) = 14.72 m = 48.3 ft`, and 60 % of that is 29 ft.

### Shadow inventory

With S1 + S3 + S4 at 150 ft, 834 acres are uncovered and must cluster into eight stream bottoms:

| ID | Acres | Center (N, W) | Floor elev ft (mean / min) |
| --- | --- | --- | --- |
| U1 | 123 | 34.62226, 87.86571 | 590 / 517 |
| U2 | 91 | 34.61643, 87.84536 | 560 / 497 |
| U3 | 77 | 34.63696, 87.85989 | 654 / 506 |
| U4 | 77 | 34.60770, 87.85025 | 576 / 515 |
| U5 | 70 | 34.64472, 87.86730 | 671 / 527 |
| U6 | 57 | 34.62832, 87.85425 | 583 / 485 |
| U7 | 42 | 34.61395, 87.88620 | 638 / 574 |
| U8 | 40 | 34.61894, 87.87664 | 599 / 554 |

Cluster count and total acreage are the assertions. Individual cluster centroids may move by up to 200 ft as the labeling algorithm differs.

## Expected divergence

Two results should **not** match, and the difference is informative rather than a failure:

1. **Canopy-derived coverage.** The reference analysis assigned canopy heights by forest stand type from a broker map. The tool samples a measured 0.6 m canopy height model. Coverage numbers over canopy will differ, and the tool's should be better. Record both.
2. **Boundary geometry.** The reference boundary was traced from a map image with roughly 15 m positioning error. An imported or surveyed boundary will shift areas slightly.

## Other test classes

| Test | Method | Pass criterion |
| --- | --- | --- |
| Terrain sampling | 200 random points against the USGS Elevation Point Query Service | Within 3DEP stated vertical accuracy |
| Geometry | PLSS sections, nominally 640 acres | Within 0.5 % |
| Viewshed | Cross-check against GRASS `r.viewshed`, same DEM and parameters | Cell agreement above 99 % |
| P.1812 | The ITU's own validation dataset through Py1812 | Match reference output to published tolerance |
| ITM | Identical profiles against SPLAT! | Within 1 dB |
| Link budget | Three paths hand-calculated against a published path sheet | Exact |
| Rain | P.837 output against published maps for five ITU regions | Match the recommendation's tables |
| Regulatory | 10 known paths against the FCC's own ULS web search | Identical license set |

## Ground truth

Every test above checks one model against another. The only real validation is field measurement. Two ways to close it:

1. Accept measurement imports: a CSV of GPS position and RSSI from a drive test or site survey, overlaid on predicted coverage with a residual statistic.
2. Build a library of known-good operational links. Any link you know works, or does not, is a data point.

## Error budget

| Source | Typical magnitude |
| --- | --- |
| DEM vertical error | 10 cm to 1 m where lidar, several meters on 10 m data |
| Canopy height model | 2 to 4 m RMSE, worse in mixed stands |
| Propagation model | 6 to 14 dB standard deviation |
| Boundary geometry | Survey-grade if imported, ~15 m if traced |
| Clutter classification | Categorical, occasionally simply wrong |

The propagation term dominates the others by an order of magnitude. Report coverage with a confidence level, not as a hard boundary.
