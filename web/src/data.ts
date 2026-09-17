import type { Project } from "./types";
const radio = {
  antenna_height_m: 45.72,
  tx_power_dbm: 27,
  tx_line_loss_db: 1,
  antenna_gain_dbi: 23,
  rx_line_loss_db: 1,
  rx_sensitivity_dbm: -75,
  noise_figure_db: 6,
  sensitivity_condition:
    "Illustrative threshold at 20 MHz; replace with your radio data sheet",
};
export const defaultProject: Project = {
  schema_version: 1,
  name: "Waterfall Valley · S3 to S4",
  a: {
    ...radio,
    name: "S3 · West ridge",
    latitude: 34.62537,
    longitude: -87.88113,
  },
  b: {
    ...radio,
    name: "S4 · East ridge",
    latitude: 34.63375,
    longitude: -87.8546,
  },
  frequency_ghz: 5.8,
  bandwidth_mhz: 20,
  k_factor: 4 / 3,
  fresnel_fraction: 0.6,
  additional_loss_db: 0,
  polarization_loss_db: 0,
  required_margin_db: 20,
  clutter_height_m: 0,
  terrain_mode: "usgs",
  profile: [],
  profile_source: "User supplied terrain profile",
  obstacles: [],
};
export const cloneDefault = () => structuredClone(defaultProject);
