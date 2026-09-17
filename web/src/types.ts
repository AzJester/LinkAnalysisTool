export interface Endpoint {
  name: string;
  latitude: number;
  longitude: number;
  antenna_height_m: number;
  tx_power_dbm: number;
  tx_line_loss_db: number;
  antenna_gain_dbi: number;
  rx_line_loss_db: number;
  rx_sensitivity_dbm: number;
  noise_figure_db: number;
  sensitivity_condition: string;
}
export interface ProfilePoint {
  distance_m: number;
  elevation_m: number;
}
export interface Project {
  schema_version: 1;
  name: string;
  a: Endpoint;
  b: Endpoint;
  frequency_ghz: number;
  bandwidth_mhz: number;
  k_factor: number;
  fresnel_fraction: number;
  additional_loss_db: number;
  polarization_loss_db: number;
  required_margin_db: number;
  clutter_height_m: number;
  terrain_mode: "usgs" | "none" | "uploaded";
  profile: ProfilePoint[];
  profile_source: string;
  obstacles: { name: string; fraction: number; height_m: number }[];
}
export interface Budget {
  from: string;
  to: string;
  eirp_dbm: number;
  received_power_dbm: number;
  sensitivity_dbm: number;
  margin_db: number;
  thermal_noise_dbm: number;
  thermal_snr_db: number;
  meets_target: boolean;
  ledger: { name: string; value_db: number; unit: string }[];
}
export interface PlotPoint extends ProfilePoint {
  distance_km: number;
  terrain_effective_m: number;
  obstruction_effective_m: number;
  ray_m: number;
  fresnel_lower_m: number;
  fresnel_upper_m: number;
  required_lower_m: number;
  clearance_m: number;
  required_clearance_margin_m: number;
  curvature_m: number;
  latitude?: number;
  longitude?: number;
  source_id?: string;
}
export interface Result {
  schema_version: number;
  created_at: string;
  engine_version: string;
  build_commit: string;
  model_id: string;
  model_scope: string;
  project: Project;
  distance_m: number;
  azimuth_a_deg: number;
  azimuth_b_deg: number;
  free_space_loss_db: number;
  wavelength_m: number;
  midpoint_fresnel_m: number;
  a_to_b: Budget;
  b_to_a: Budget;
  limiting_margin_db: number;
  limiting_direction: string;
  status: string;
  verdict: string;
  warnings: string[];
  sources: {
    id: string;
    name: string;
    vertical_datum: string;
    url?: string;
    acquisition_start?: string;
    acquisition_end?: string;
    publication_date?: string;
    sample_count?: number;
    resolution_note?: string;
  }[];
  terrain_index: { status?: string; projects?: unknown[] };
  terrain_retrieved_at: string | null;
  terrain_profile_sha256: string | null;
  profile: null | {
    samples: PlotPoint[];
    minimum_clearance_m: number;
    minimum_fresnel_fraction: number;
    required_clearance_margin_m: number;
    controlling_distance_m: number;
    controlling_obstacle: string | null;
    los_clear: boolean;
    fresnel_clear: boolean;
    antenna_a_elevation_m: number;
    antenna_b_elevation_m: number;
    sample_count: number;
    max_sample_spacing_m: number;
    equal_height_increase_m: number;
  };
  availability: { status: string; reason: string };
  regulatory: { status: string; reason: string };
}
export interface SavedProject {
  id: string;
  savedAt: string;
  project: Project;
}
