"""Internal-consistency checks on the Waterfall Valley acceptance fixture.

These need no engine code. They verify that the fixture's own numbers are
arithmetically sound, so a failure here means the fixture was edited wrongly,
not that the engine regressed. These do not reconstruct area coverage.
Current engine tests live in test_engine.py; see docs/VALIDATION.md for
unresolved historical conventions and independent audit results.
"""

import json
import math
from pathlib import Path

import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "waterfall_valley"
BANDS_GHZ = {"mhz_900": 0.9, "ghz_2_4": 2.4, "ghz_5_8": 5.8}
M_PER_FT = 0.3048
M_PER_MI = 1609.344


@pytest.fixture(scope="module")
def expected():
    return json.loads((FIXTURE / "expected_results.json").read_text())


def fresnel_f1_m(d1_km: float, d2_km: float, freq_ghz: float) -> float:
    """First Fresnel zone radius in meters. Distances in km, frequency in GHz."""
    return 17.32 * math.sqrt((d1_km * d2_km) / (freq_ghz * (d1_km + d2_km)))


def vincenty_inverse(lat1, lon1, lat2, lon2):
    """WGS84 geodesic distance (m) and forward azimuth (deg) from point 1 to 2."""
    a = 6378137.0
    f = 1 / 298.257223563
    b = (1 - f) * a
    dlon = math.radians(lon2 - lon1)
    u1 = math.atan((1 - f) * math.tan(math.radians(lat1)))
    u2 = math.atan((1 - f) * math.tan(math.radians(lat2)))
    su1, cu1, su2, cu2 = math.sin(u1), math.cos(u1), math.sin(u2), math.cos(u2)
    lam = dlon
    for _ in range(200):
        sl, cl = math.sin(lam), math.cos(lam)
        sin_sig = math.hypot(cu2 * sl, cu1 * su2 - su1 * cu2 * cl)
        if sin_sig == 0:
            return 0.0, 0.0
        cos_sig = su1 * su2 + cu1 * cu2 * cl
        sig = math.atan2(sin_sig, cos_sig)
        sin_alpha = cu1 * cu2 * sl / sin_sig
        cos2_alpha = 1 - sin_alpha**2
        cos_2sm = cos_sig - 2 * su1 * su2 / cos2_alpha if cos2_alpha else 0.0
        c = f / 16 * cos2_alpha * (4 + f * (4 - 3 * cos2_alpha))
        lam_prev = lam
        lam = dlon + (1 - c) * f * sin_alpha * (
            sig + c * sin_sig * (cos_2sm + c * cos_sig * (-1 + 2 * cos_2sm**2))
        )
        if abs(lam - lam_prev) < 1e-12:
            break
    u_sq = cos2_alpha * (a * a - b * b) / (b * b)
    big_a = 1 + u_sq / 16384 * (4096 + u_sq * (-768 + u_sq * (320 - 175 * u_sq)))
    big_b = u_sq / 1024 * (256 + u_sq * (-128 + u_sq * (74 - 47 * u_sq)))
    d_sig = big_b * sin_sig * (
        cos_2sm
        + big_b / 4 * (cos_sig * (-1 + 2 * cos_2sm**2)
        - big_b / 6 * cos_2sm * (-3 + 4 * sin_sig**2) * (-3 + 4 * cos_2sm**2))
    )
    dist = b * big_a * (sig - d_sig)
    az = math.degrees(
        math.atan2(cu2 * math.sin(lam), cu1 * su2 - su1 * cu2 * math.cos(lam))
    ) % 360
    return dist, az


def test_fixture_files_present():
    for name in (
        "WaterfallValley_DEM_30m_meters.tif",
        "WaterfallValley_Elevation_KeyPoints.csv",
        "parcel.geojson",
        "expected_results.json",
    ):
        assert (FIXTURE / name).is_file(), f"missing fixture file: {name}"


def test_parcel_geojson_rings_closed(expected):
    gj = json.loads((FIXTURE / "parcel.geojson").read_text())
    roles = {f["properties"]["role"] for f in gj["features"]}
    assert roles == {"parcel", "inholding"}
    for feat in gj["features"]:
        ring = feat["geometry"]["coordinates"][0]
        assert ring[0] == ring[-1], "ring is not closed"
        assert len(ring) >= 5


def test_every_link_endpoint_is_a_known_site(expected):
    sites = expected["sites"]
    for link in expected["links"]:
        if link.startswith("_"):
            continue
        for end in link.split("-"):
            assert end in sites, f"link {link} references unknown site {end}"


@pytest.mark.parametrize("band", sorted(BANDS_GHZ))
def test_fresnel_values_reproduce_from_formula(expected, band):
    """60 % F1 at mid-path is exact arithmetic and must match to the foot."""
    links = expected["links"]
    for link, vals in expected["fresnel_60pct_f1_midpath_ft"].items():
        if link.startswith("_"):
            continue
        d_km = links[link]["dist_km"]
        half = d_km / 2
        computed_ft = round(fresnel_f1_m(half, half, BANDS_GHZ[band]) / M_PER_FT * 0.60)
        assert abs(computed_ft - vals[band]) <= 1, (
            f"{link} @ {band}: formula gives {computed_ft} ft, "
            f"fixture says {vals[band]} ft"
        )


def test_link_geometry_reproduces_from_site_coordinates(expected):
    """Distances and azimuths must follow from the site coordinates."""
    sites = expected["sites"]
    tol = expected["links"]["_tol"]
    for link, vals in expected["links"].items():
        if link.startswith("_"):
            continue
        a, b = link.split("-")
        dist_m, az = vincenty_inverse(
            sites[a]["lat"], sites[a]["lon"], sites[b]["lat"], sites[b]["lon"]
        )
        assert abs(dist_m / M_PER_MI - vals["dist_mi"]) <= tol["distance_mi"]
        assert abs(dist_m / 1000 - vals["dist_km"]) <= 0.02
        delta_az = ((az - vals["az_deg"] + 180) % 360) - 180
        assert abs(delta_az) <= tol["azimuth_deg"]


def test_taller_towers_never_reduce_coverage(expected):
    cov = expected["single_site_coverage_pct"]
    for site, v in cov.items():
        if site.startswith("_"):
            continue
        assert v["ground_150"] >= v["ground_100"], f"{site} ground coverage fell with height"
        assert v["air200_150"] >= v["air200_100"], f"{site} air coverage fell with height"


def test_network_beats_every_single_site(expected):
    """The recommended trio must outperform the best site on its own."""
    best_single = max(
        v["ground_150"]
        for k, v in expected["single_site_coverage_pct"].items()
        if not k.startswith("_")
    )
    network = expected["network"]["coverage_pct"]["whole_parcel"]["towers_150"]
    assert network > best_single


def test_shadow_acreage_matches_uncovered_fraction(expected):
    """Clustered shadow acres must reconcile with the coverage percentage."""
    net_acres = expected["geometry"]["net_area_acres"]["value"]
    covered_pct = expected["network"]["coverage_pct"]["whole_parcel"]["towers_150"]
    implied = net_acres * (1 - covered_pct / 100)
    stated = expected["shadows"]["total_uncovered_acres"]["value"]
    assert abs(implied - stated) / stated < 0.05, (
        f"coverage implies {implied:.0f} uncovered acres, fixture states {stated}"
    )
    clusters = expected["shadows"]["clusters"]
    assert len(clusters) == expected["shadows"]["cluster_count"]["value"]
    assert sum(c["acres"] for c in clusters) <= stated


def test_elevation_percentiles_are_ordered(expected):
    e = expected["elevation"]
    order = ["min_ft", "p5_ft", "p25_ft", "median_ft", "p75_ft", "p95_ft", "max_ft"]
    values = [e[k]["value"] for k in order]
    assert values == sorted(values), f"percentiles out of order: {dict(zip(order, values))}"
    assert e["min_ft"]["value"] <= e["mean_ft"]["value"] <= e["max_ft"]["value"]


def test_site_elevations_fall_within_parcel_range(expected):
    lo = expected["elevation"]["min_ft"]["value"]
    hi = expected["elevation"]["max_ft"]["value"]
    for site, v in expected["sites"].items():
        assert lo <= v["elev_ft_3dep"] <= hi, f"{site} elevation outside parcel range"
