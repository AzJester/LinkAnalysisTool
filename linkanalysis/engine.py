"""Free-space budgets and sampled effective-Earth geometry, not a coverage model."""

import math
from bisect import bisect_right
from datetime import datetime, timezone

from geographiclib.geodesic import Geodesic

from . import __version__
from .models import Project

SPEED_OF_LIGHT_M_S = 299792458.0
EARTH_RADIUS_M = 6371000.0
MODEL_ID = "free-space-friis-v1"


def geometry(project: Project) -> dict:
    inverse = Geodesic.WGS84.Inverse(
        project.a.latitude, project.a.longitude, project.b.latitude, project.b.longitude
    )
    distance_m = inverse["s12"]
    if not 10 <= distance_m <= 200000:
        raise ValueError("Choose endpoints between 10 m and 200 km apart.")
    return {
        "distance_m": distance_m,
        "azimuth_a_deg": inverse["azi1"] % 360,
        "azimuth_b_deg": (inverse["azi2"] + 180) % 360,
    }


def path_coordinates(project: Project, sample_count: int) -> list[dict]:
    info = geometry(project)
    line = Geodesic.WGS84.InverseLine(
        project.a.latitude, project.a.longitude, project.b.latitude, project.b.longitude
    )
    points = []
    for i in range(sample_count):
        distance_m = info["distance_m"] * i / (sample_count - 1)
        p = line.Position(distance_m)
        points.append(
            {"distance_m": distance_m, "latitude": p["lat2"], "longitude": p["lon2"]}
        )
    return points


def free_space_loss_db(distance_m: float, frequency_ghz: float) -> float:
    if distance_m <= 0 or frequency_ghz <= 0:
        raise ValueError("Distance and frequency must be positive.")
    return 20 * math.log10(
        4 * math.pi * distance_m * frequency_ghz * 1e9 / SPEED_OF_LIGHT_M_S
    )


def fresnel_radius_m(
    distance_a_m: float, distance_b_m: float, frequency_ghz: float
) -> float:
    if (
        distance_a_m < 0
        or distance_b_m < 0
        or frequency_ghz <= 0
        or distance_a_m + distance_b_m <= 0
    ):
        raise ValueError("Invalid Fresnel inputs.")
    return math.sqrt(
        SPEED_OF_LIGHT_M_S
        / (frequency_ghz * 1e9)
        * distance_a_m
        * distance_b_m
        / (distance_a_m + distance_b_m)
    )


def direction_budget(tx, rx, project: Project, fspl_db: float) -> dict:
    eirp_dbm = tx.tx_power_dbm - tx.tx_line_loss_db + tx.antenna_gain_dbi
    received_dbm = (
        eirp_dbm
        - fspl_db
        - project.additional_loss_db
        - project.polarization_loss_db
        + rx.antenna_gain_dbi
        - rx.rx_line_loss_db
    )
    noise_dbm = -174 + 10 * math.log10(project.bandwidth_mhz * 1e6) + rx.noise_figure_db
    return {
        "from": tx.name,
        "to": rx.name,
        "eirp_dbm": eirp_dbm,
        "received_power_dbm": received_dbm,
        "sensitivity_dbm": rx.rx_sensitivity_dbm,
        "margin_db": received_dbm - rx.rx_sensitivity_dbm,
        "thermal_noise_dbm": noise_dbm,
        "thermal_snr_db": received_dbm - noise_dbm,
        "meets_target": received_dbm - rx.rx_sensitivity_dbm
        >= project.required_margin_db,
        "ledger": [
            {
                "name": "Conducted transmit power",
                "value_db": tx.tx_power_dbm,
                "unit": "dBm",
            },
            {
                "name": "Transmit feeder loss",
                "value_db": -tx.tx_line_loss_db,
                "unit": "dB",
            },
            {
                "name": "Transmit antenna gain",
                "value_db": tx.antenna_gain_dbi,
                "unit": "dBi",
            },
            {"name": "Free-space path loss", "value_db": -fspl_db, "unit": "dB"},
            {
                "name": "User-entered additional loss",
                "value_db": -project.additional_loss_db,
                "unit": "dB",
            },
            {
                "name": "Polarization mismatch loss",
                "value_db": -project.polarization_loss_db,
                "unit": "dB",
            },
            {
                "name": "Receive antenna gain",
                "value_db": rx.antenna_gain_dbi,
                "unit": "dBi",
            },
            {
                "name": "Receive feeder loss",
                "value_db": -rx.rx_line_loss_db,
                "unit": "dB",
            },
        ],
    }


def profile_geometry(project: Project, samples: list[dict], distance_m: float) -> dict:
    if len(samples) < 3:
        raise ValueError("A terrain profile needs at least three samples.")
    if abs(samples[0]["distance_m"]) > 0.001 or abs(
        samples[-1]["distance_m"] - distance_m
    ) > max(1, distance_m * 0.001):
        raise ValueError(
            "The uploaded profile length must match the geodesic path within 0.1% (at least 1 m tolerance)."
        )
    samples = [dict(p) for p in samples]
    # Normalize accepted rounding of the uploaded distance axis to the geodesic.
    scale = distance_m / samples[-1]["distance_m"]
    for point in samples:
        point["distance_m"] *= scale
    samples[0]["distance_m"] = 0
    distances = [p["distance_m"] for p in samples]
    for obstacle in project.obstacles:
        d = distance_m * obstacle.fraction
        index = min(max(bisect_right(distances, d), 1), len(samples) - 1)
        left, right = samples[index - 1], samples[index]
        ratio = (d - left["distance_m"]) / (right["distance_m"] - left["distance_m"])
        elevation_m = left["elevation_m"] + ratio * (
            right["elevation_m"] - left["elevation_m"]
        )
        samples.append(
            {
                "distance_m": d,
                "elevation_m": elevation_m,
                "obstacle_height_m": obstacle.height_m,
                "obstacle_name": obstacle.name,
            }
        )
    samples.sort(key=lambda p: p["distance_m"])
    start_height_m = samples[0]["elevation_m"] + project.a.antenna_height_m
    end_height_m = samples[-1]["elevation_m"] + project.b.antenna_height_m
    plotted = []
    for point in samples:
        d = point["distance_m"]
        fraction = d / distance_m
        bulge_m = d * (distance_m - d) / (2 * project.k_factor * EARTH_RADIUS_M)
        ray_m = start_height_m + (end_height_m - start_height_m) * fraction
        terrain_m = point["elevation_m"] + bulge_m
        envelope_m = terrain_m + max(
            project.clutter_height_m, point.get("obstacle_height_m", 0)
        )
        fresnel_m = fresnel_radius_m(d, max(0, distance_m - d), project.frequency_ghz)
        plotted.append(
            {
                **point,
                "distance_km": d / 1000,
                "curvature_m": bulge_m,
                "terrain_effective_m": terrain_m,
                "obstruction_effective_m": envelope_m,
                "ray_m": ray_m,
                "fresnel_radius_m": fresnel_m,
                "fresnel_lower_m": ray_m - fresnel_m,
                "fresnel_upper_m": ray_m + fresnel_m,
                "required_lower_m": ray_m - project.fresnel_fraction * fresnel_m,
                "clearance_m": ray_m - envelope_m,
                "required_clearance_margin_m": ray_m
                - envelope_m
                - project.fresnel_fraction * fresnel_m,
            }
        )
    # Fresnel percentage is undefined where its radius is zero at either endpoint.
    interior = [p for p in plotted if p["fresnel_radius_m"] > 1e-6]
    controlling = min(plotted, key=lambda p: p["required_clearance_margin_m"])
    return {
        "samples": plotted,
        "minimum_clearance_m": min(p["clearance_m"] for p in plotted),
        "minimum_fresnel_fraction": min(
            p["clearance_m"] / p["fresnel_radius_m"] for p in interior
        ),
        "required_clearance_margin_m": controlling["required_clearance_margin_m"],
        "controlling_distance_m": controlling["distance_m"],
        "controlling_obstacle": controlling.get("obstacle_name"),
        "los_clear": all(p["clearance_m"] >= 0 for p in plotted),
        "fresnel_clear": controlling["required_clearance_margin_m"] >= 0,
        "antenna_a_elevation_m": start_height_m,
        "antenna_b_elevation_m": end_height_m,
        "sample_count": len(samples),
        "max_sample_spacing_m": max(
            b["distance_m"] - a["distance_m"] for a, b in zip(samples, samples[1:])
        ),
        "equal_height_increase_m": max(0, -controlling["required_clearance_margin_m"]),
    }


def calculate(
    project: Project, terrain: dict | None = None, terrain_error: str | None = None
) -> dict:
    info = geometry(project)
    fspl_db = free_space_loss_db(info["distance_m"], project.frequency_ghz)
    a_to_b = direction_budget(project.a, project.b, project, fspl_db)
    b_to_a = direction_budget(project.b, project.a, project, fspl_db)
    warnings = [
        "Free-space reference budget. Obstruction, diffraction, vegetation, rain, gas and interference are not automatically modeled.",
        "Receiver sensitivity must match the selected bandwidth, modulation and required packet/bit error performance.",
    ]
    if project.frequency_ghz >= 10:
        warnings.append(
            "At this frequency, rain and atmospheric absorption can materially reduce margin. Include an independently established allowance in additional loss."
        )
    profile = None
    if terrain:
        profile = profile_geometry(project, terrain["samples"], info["distance_m"])
        warnings.extend(terrain.get("warnings", []))
        warnings.append(
            "Bare-earth samples can miss narrow obstacles. Trees and structures are unknown unless entered as a clutter allowance or obstacle."
        )
    elif terrain_error:
        warnings.append(terrain_error)
    else:
        warnings.append(
            "Terrain has not been checked. A positive nominal margin does not establish a usable path."
        )
    if project.clutter_height_m:
        warnings.append(
            "Uniform clutter is a user-entered geometric obstruction allowance, not a vegetation attenuation model."
        )
    if profile and not profile["los_clear"]:
        verdict = "Terrain or an entered obstacle blocks the path"
        status = "blocked"
    elif profile and not profile["fresnel_clear"]:
        verdict = "The selected Fresnel clearance is not met"
        status = "fresnel_limited"
    elif min(a_to_b["margin_db"], b_to_a["margin_db"]) < project.required_margin_db:
        verdict = "The nominal budget is below your margin target"
        status = "margin_limited"
    elif profile:
        verdict = "Sampled clearance and nominal margin meet your targets"
        status = "targets_met"
    else:
        verdict = "Nominal margin meets target; terrain is unverified"
        status = "unverified"
    return {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "engine_version": __version__,
        "model_id": MODEL_ID,
        "model_scope": "Deterministic free-space reference budget with sampled effective-Earth clearance",
        "project": project.model_dump(),
        **info,
        "free_space_loss_db": fspl_db,
        "wavelength_m": SPEED_OF_LIGHT_M_S / (project.frequency_ghz * 1e9),
        "midpoint_fresnel_m": fresnel_radius_m(
            info["distance_m"] / 2, info["distance_m"] / 2, project.frequency_ghz
        ),
        "a_to_b": a_to_b,
        "b_to_a": b_to_a,
        "limiting_margin_db": min(a_to_b["margin_db"], b_to_a["margin_db"]),
        "limiting_direction": "A to B"
        if a_to_b["margin_db"] <= b_to_a["margin_db"]
        else "B to A",
        "profile": profile,
        "sources": terrain.get("sources", []) if terrain else [],
        "terrain_index": terrain.get("index", {}) if terrain else {},
        "terrain_retrieved_at": terrain.get("retrieved_at") if terrain else None,
        "status": status,
        "verdict": verdict,
        "warnings": list(dict.fromkeys(warnings)),
        "availability": {
            "status": "not_modeled",
            "reason": "No validated rain/multipath annual outage model is enabled. Nominal margin is not availability.",
        },
        "regulatory": {
            "status": "not_screened",
            "reason": "Frequency, EIRP, licensing, AFC and siting eligibility require an independent check.",
        },
    }
