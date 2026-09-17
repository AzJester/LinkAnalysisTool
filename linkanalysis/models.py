"""Explicit SI inputs with logarithmic RF units named at every boundary."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Endpoint(StrictModel):
    name: str = Field(min_length=1, max_length=80)
    latitude: float = Field(ge=-89, le=89)
    longitude: float = Field(ge=-180, le=180)
    antenna_height_m: float = Field(ge=0.5, le=300)
    tx_power_dbm: float = Field(ge=-60, le=60)
    tx_line_loss_db: float = Field(ge=0, le=60)
    antenna_gain_dbi: float = Field(ge=-20, le=60)
    rx_line_loss_db: float = Field(ge=0, le=60)
    rx_sensitivity_dbm: float = Field(ge=-160, le=0)
    noise_figure_db: float = Field(ge=0, le=40)
    sensitivity_condition: str = Field(
        default="User-specified threshold; verify bandwidth and modulation",
        max_length=200,
    )


class Obstacle(StrictModel):
    name: str = Field(min_length=1, max_length=80)
    fraction: float = Field(gt=0, lt=1)
    height_m: float = Field(ge=0, le=500)


class ProfilePoint(StrictModel):
    distance_m: float = Field(ge=0, le=200001)
    elevation_m: float = Field(ge=-500, le=9000)


class Project(StrictModel):
    schema_version: Literal[1] = 1
    name: str = Field(default="Untitled link", min_length=1, max_length=100)
    a: Endpoint
    b: Endpoint
    frequency_ghz: float = Field(ge=0.03, le=100)
    bandwidth_mhz: float = Field(ge=0.001, le=320)
    k_factor: float = Field(ge=0.5, le=5)
    fresnel_fraction: float = Field(ge=0, le=1)
    additional_loss_db: float = Field(ge=0, le=100)
    polarization_loss_db: float = Field(ge=0, le=60)
    required_margin_db: float = Field(ge=0, le=60)
    clutter_height_m: float = Field(default=0, ge=0, le=100)
    terrain_mode: Literal["usgs", "none", "uploaded"] = "usgs"
    profile: list[ProfilePoint] = Field(default_factory=list, max_length=2001)
    profile_source: str = Field(default="User supplied terrain profile", max_length=200)
    obstacles: list[Obstacle] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def check_profile(self):
        if self.terrain_mode == "uploaded":
            if len(self.profile) < 3:
                raise ValueError("An uploaded profile needs at least three samples.")
            if abs(self.profile[0].distance_m) > 0.001:
                raise ValueError("The profile must start at distance_m = 0.")
            if any(
                right.distance_m <= left.distance_m
                for left, right in zip(self.profile, self.profile[1:])
            ):
                raise ValueError("Profile distances must be strictly increasing.")
        elif self.profile:
            raise ValueError("Terrain samples require uploaded profile mode.")
        return self
