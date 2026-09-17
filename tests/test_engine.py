import math

import pytest
from geographiclib.geodesic import Geodesic
from pydantic import ValidationError

from linkanalysis.engine import (
    calculate,
    free_space_loss_db,
    fresnel_radius_m,
    geometry,
    path_coordinates,
    profile_geometry,
)
from linkanalysis.models import Project


def flat(project, elevation=100, peak=0):
    distance = geometry(project)["distance_m"]
    return [
        {
            "distance_m": distance * i / 100,
            "elevation_m": elevation + (peak if i == 50 else 0),
        }
        for i in range(101)
    ]


def test_fspl_known_reference():
    # Friis reference: 1 km, 1 GHz is 92.4478 dB, using exact vacuum c.
    assert free_space_loss_db(1000, 1) == pytest.approx(92.44778322, abs=1e-7)
    assert free_space_loss_db(2000, 1) - free_space_loss_db(1000, 1) == pytest.approx(
        6.020599913
    )
    assert free_space_loss_db(1000, 2) - free_space_loss_db(1000, 1) == pytest.approx(
        6.020599913
    )


def test_fresnel_known_reference():
    assert fresnel_radius_m(500, 500, 1) == pytest.approx(8.657257907, abs=1e-8)
    assert fresnel_radius_m(0, 1000, 1) == 0


def test_wgs84_equatorial_reference(project):
    project.a.latitude = project.b.latitude = 0
    project.a.longitude, project.b.longitude = 0, 1
    g = geometry(project)
    assert g["distance_m"] == pytest.approx(111319.490793, abs=1e-6)
    assert g["azimuth_a_deg"] == 90
    assert g["azimuth_b_deg"] == 270


def test_two_direction_asymmetry_and_noise(project):
    project.b.tx_power_dbm = 17
    project.b.rx_sensitivity_dbm = -80
    project.b.rx_line_loss_db = 3
    result = calculate(project)
    fspl = result["free_space_loss_db"]
    assert result["a_to_b"]["received_power_dbm"] == pytest.approx(
        27 - 1 + 23 - fspl + 23 - 3
    )
    assert result["b_to_a"]["received_power_dbm"] == pytest.approx(
        17 - 1 + 23 - fspl + 23 - 1
    )
    assert result["a_to_b"]["margin_db"] - result["b_to_a"][
        "margin_db"
    ] == pytest.approx(13)
    assert result["a_to_b"]["thermal_noise_dbm"] == pytest.approx(-94.98970004336)
    assert result["limiting_direction"] == "B to A"


def test_losses_are_counted_once(project):
    baseline = calculate(project)
    project.additional_loss_db, project.polarization_loss_db = 7, 3
    loss = calculate(project)
    assert baseline["limiting_margin_db"] - loss["limiting_margin_db"] == pytest.approx(
        10
    )
    assert sum(item["value_db"] for item in loss["a_to_b"]["ledger"]) == pytest.approx(
        loss["a_to_b"]["received_power_dbm"]
    )


def test_positive_margin_does_not_claim_working_link(project):
    result = calculate(project)
    assert result["limiting_margin_db"] > project.required_margin_db
    assert result["status"] == "unverified"
    assert result["availability"]["status"] == "not_modeled"
    assert result["regulatory"]["status"] == "not_screened"


def test_obstructed_path_overrides_positive_budget(project):
    result = calculate(project, {"samples": flat(project, peak=80)})
    assert result["status"] == "blocked"
    assert result["limiting_margin_db"] > 20
    assert not result["profile"]["los_clear"]


def test_height_recommendation_reaches_boundary(project):
    terrain = {"samples": flat(project, peak=50)}
    before = calculate(project, terrain)
    increase = before["profile"]["equal_height_increase_m"]
    project.a.antenna_height_m += increase + 0.001
    project.b.antenna_height_m += increase + 0.001
    assert calculate(project, terrain)["profile"]["fresnel_clear"]


def test_curvature_40_miles_is_about_200_feet(project):
    distance = 40 * 1609.344
    points = [
        {"distance_m": 0, "elevation_m": 0},
        {"distance_m": distance / 2, "elevation_m": 0},
        {"distance_m": distance, "elevation_m": 0},
    ]
    result = profile_geometry(project, points, distance)
    assert result["samples"][1]["curvature_m"] / 0.3048 == pytest.approx(
        200.064, abs=0.02
    )


def test_off_grid_obstacle_controls_profile(project):
    project.obstacles = Project.model_validate(
        {
            **project.model_dump(),
            "obstacles": [{"name": "Tall tree", "fraction": 0.375, "height_m": 90}],
        }
    ).obstacles
    result = calculate(project, {"samples": flat(project)})
    assert result["status"] == "blocked"
    assert result["profile"]["controlling_obstacle"] == "Tall tree"
    assert len(result["profile"]["samples"]) == 102


def test_clutter_and_obstacle_envelopes_do_not_add(project):
    project.clutter_height_m = 20
    data = project.model_dump()
    data["obstacles"] = [{"name": "Tree", "fraction": 0.5, "height_m": 15}]
    result = calculate(Project.model_validate(data), {"samples": flat(project)})
    center = min(
        result["profile"]["samples"],
        key=lambda p: abs(p["distance_m"] - result["distance_m"] / 2),
    )
    assert center["obstruction_effective_m"] - center["terrain_effective_m"] == 20


def test_profile_rounding_normalized_and_large_mismatch_rejected(project):
    points = flat(project)
    points[-1]["distance_m"] += 0.1
    profile = profile_geometry(project, points, geometry(project)["distance_m"])
    assert profile["samples"][-1]["curvature_m"] == 0
    points[-1]["distance_m"] += 100
    with pytest.raises(ValueError, match="length must match"):
        profile_geometry(project, points, geometry(project)["distance_m"])


@pytest.mark.parametrize(
    "field,value",
    [
        ("frequency_ghz", 0),
        ("k_factor", -1),
        ("bandwidth_mhz", math.nan),
        ("additional_loss_db", math.inf),
        ("fresnel_fraction", 2),
    ],
)
def test_invalid_inputs_rejected(project, field, value):
    with pytest.raises(ValidationError):
        Project.model_validate({**project.model_dump(), field: value})


def test_profile_nonmonotonic_rejected(project):
    data = project.model_dump()
    data.update(
        terrain_mode="uploaded",
        profile=[
            {"distance_m": 0, "elevation_m": 100},
            {"distance_m": 20, "elevation_m": 100},
            {"distance_m": 10, "elevation_m": 100},
        ],
    )
    with pytest.raises(ValidationError, match="strictly increasing"):
        Project.model_validate(data)


def test_dateline_path_samples_follow_short_geodesic(project):
    project.a.latitude = project.b.latitude = 0
    project.a.longitude, project.b.longitude = 179.9, -179.9
    points = path_coordinates(project, 11)
    assert geometry(project)["distance_m"] == pytest.approx(22263.89816, abs=0.001)
    assert abs(points[5]["longitude"]) == pytest.approx(180)
    assert points[-1]["distance_m"] == pytest.approx(
        Geodesic.WGS84.Inverse(0, 179.9, 0, -179.9)["s12"]
    )
