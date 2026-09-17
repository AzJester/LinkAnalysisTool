import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Check,
  Info,
  Mountain,
  Radio,
  ShieldCheck,
} from "lucide-react";
import type { Result } from "./types";

export const fmt = (n: number, digits = 1) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "Unavailable";
export default function Results({
  result: r,
  imperial,
  stale,
}: {
  result: Result;
  imperial: boolean;
  stale: boolean;
}) {
  const factor = imperial ? 1 / 0.3048 : 1,
    unit = imperial ? "ft" : "m";
  const height = (v: number) => `${fmt(v * factor)} ${unit}`;
  const profile = r.profile;
  const chart = profile?.samples.map((p) => ({
    ...p,
    ground: p.terrain_effective_m * factor,
    envelope: p.obstruction_effective_m * factor,
    ray: p.ray_m * factor,
    lower: p.fresnel_lower_m * factor,
    upper: p.fresnel_upper_m * factor,
    required: p.required_lower_m * factor,
  }));
  const axisMin = chart
    ? Math.floor(
        (Math.min(...chart.map((p) => Math.min(p.ground, p.lower))) -
          5 * factor) /
          (20 * factor),
      ) *
      20 *
      factor
    : 0;
  return (
    <div className={stale ? "results stale" : "results"}>
      <div
        className={`verdict ${stale ? "unverified" : r.status}`}
        role="status"
      >
        <div className="verdict-icon">
          {r.status === "targets_met" && !stale ? (
            <Check size={22} />
          ) : (
            <Info size={22} />
          )}
        </div>
        <div>
          <span className="eyebrow">
            {stale ? "Previous calculation" : "Path assessment"}
          </span>
          <h2>
            {stale
              ? "Inputs changed. Run analysis to update these results."
              : r.verdict}
          </h2>
          <p>
            {profile
              ? `${fmt(r.project.fresnel_fraction * 100, 0)}% Fresnel criterion · ${fmt(r.project.required_margin_db, 0)} dB nominal margin target`
              : "Terrain clearance is unverified."}{" "}
            <strong>Availability is not modeled.</strong>
          </p>
        </div>
      </div>
      <div className="metrics">
        <div className="metric">
          <span>Path length</span>
          <strong>
            {fmt(r.distance_m / (imperial ? 1609.344 : 1000), 2)}{" "}
            <small>{imperial ? "mi" : "km"}</small>
          </strong>
          <p>A → B {fmt(r.azimuth_a_deg)}° true</p>
        </div>
        <div className="metric">
          <span>Limiting nominal margin</span>
          <strong
            className={
              r.limiting_margin_db < r.project.required_margin_db
                ? "negative"
                : ""
            }
          >
            {fmt(r.limiting_margin_db)} <small>dB</small>
          </strong>
          <p>
            {r.limiting_direction} · target{" "}
            {fmt(r.project.required_margin_db, 0)} dB
          </p>
        </div>
        <div className="metric">
          <span>Minimum geometric clearance</span>
          <strong>
            {profile ? fmt(profile.minimum_clearance_m * factor) : "—"}{" "}
            <small>{unit}</small>
          </strong>
          <p>
            {profile
              ? profile.los_clear
                ? "Ray clears sampled obstructions"
                : "Sampled path is obstructed"
              : "Requires a terrain profile"}
          </p>
        </div>
        <div className="metric">
          <span>Free-space path loss</span>
          <strong>
            {fmt(r.free_space_loss_db)} <small>dB</small>
          </strong>
          <p>
            {fmt(r.project.frequency_ghz, 3)} GHz ·{" "}
            {fmt(r.project.bandwidth_mhz, 1)} MHz
          </p>
        </div>
      </div>
      <section className="panel profile-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">See the whole path</span>
            <h2>
              <Mountain size={19} /> Terrain & Fresnel profile
            </h2>
          </div>
          <span className="chip">k = {fmt(r.project.k_factor, 3)}</span>
        </div>
        {profile && chart ? (
          <>
            <div className="chart-legend">
              <span>
                <i className="legend-ground" />
                Effective terrain
              </span>
              <span>
                <i className="legend-ray" />
                Antenna ray
              </span>
              <span>
                <i className="legend-fresnel" />
                First Fresnel zone
              </span>
              <span>
                <i className="legend-required" />
                {fmt(r.project.fresnel_fraction * 100, 0)}% lower boundary
              </span>
            </div>
            <div
              className="profile-chart"
              role="img"
              aria-label={`Terrain profile. Minimum clearance ${height(profile.minimum_clearance_m)}; selected Fresnel clearance ${profile.fresnel_clear ? "met" : "not met"}.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chart}
                  margin={{ top: 12, right: 20, left: 10, bottom: 20 }}
                  accessibilityLayer
                >
                  <CartesianGrid vertical={false} stroke="#e6ece8" />
                  <XAxis
                    type="number"
                    dataKey="distance_km"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) => fmt(v / (imperial ? 1.609344 : 1), 1)}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    label={{
                      value: `Distance from A (${imperial ? "mi" : "km"})`,
                      position: "insideBottom",
                      offset: -12,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    domain={[axisMin, "auto"]}
                    tickFormatter={(v) => fmt(v, 0)}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={58}
                    label={{
                      value: `Elevation (${unit})`,
                      angle: -90,
                      position: "insideLeft",
                      offset: 0,
                      fontSize: 11,
                    }}
                  />
                  <Tooltip
                    labelFormatter={(v) =>
                      `${fmt(Number(v) / (imperial ? 1.609344 : 1), 2)} ${imperial ? "mi" : "km"} from A`
                    }
                    formatter={(v, name) => [`${fmt(Number(v))} ${unit}`, name]}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #dce5df",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="linear"
                    dataKey="ground"
                    name="Effective terrain"
                    stroke="#758977"
                    fill="#ced9cb"
                    baseValue={axisMin}
                    isAnimationActive={false}
                  />
                  {(r.project.clutter_height_m > 0 ||
                    r.project.obstacles.length > 0) && (
                    <Line
                      type="linear"
                      dataKey="envelope"
                      name="Obstruction envelope"
                      stroke="#996637"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                  <Line
                    type="linear"
                    dataKey="upper"
                    name="Full Fresnel upper"
                    stroke="#bca365"
                    strokeDasharray="3 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="lower"
                    name="Full Fresnel lower"
                    stroke="#bca365"
                    strokeDasharray="3 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="required"
                    name="Required lower boundary"
                    stroke="#bd8435"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="ray"
                    name="Antenna ray"
                    stroke="#13766e"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="profile-stats">
              <div>
                <span>Controlling point from A</span>
                <strong>
                  {fmt(
                    profile.controlling_distance_m /
                      (imperial ? 1609.344 : 1000),
                    2,
                  )}{" "}
                  {imperial ? "mi" : "km"}
                  {profile.controlling_obstacle
                    ? ` · ${profile.controlling_obstacle}`
                    : ""}
                </strong>
              </div>
              <div>
                <span>Clearance above selected Fresnel boundary</span>
                <strong>{height(profile.required_clearance_margin_m)}</strong>
              </div>
              <div>
                <span>Maximum sample spacing</span>
                <strong>
                  {height(profile.max_sample_spacing_m)} ·{" "}
                  {profile.sample_count} points
                </strong>
              </div>
            </div>
            {profile.equal_height_increase_m > 0 && (
              <p className="notice">
                For this sampled geometry, raising{" "}
                <strong>both antennas</strong> by at least{" "}
                {height(profile.equal_height_increase_m)} reaches the selected
                clearance boundary. Round up and allow for terrain and obstacle
                uncertainty.
              </p>
            )}
            <p className="footnote">
              The terrain is raised by d₁d₂ / (2kR) for effective-Earth
              curvature. Elevations use the source datum; antenna heights are
              above ground. Fresnel clearance is checked at every sample and
              entered obstacle.
            </p>
          </>
        ) : (
          <div className="empty-profile">
            <Mountain size={30} />
            <h3>No verified terrain profile</h3>
            <p>
              {r.project.terrain_mode === "none"
                ? "Choose live USGS terrain or import a profile to inspect clearance."
                : "Live terrain could not be verified. Review the notices below, retry, or import a complete terrain profile."}
            </p>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Every gain. Every loss.</span>
            <h2>
              <Radio size={19} /> Directional link budgets
            </h2>
          </div>
          <span className="chip">Free-space reference</span>
        </div>
        <div className="table-scroll">
          <table className="budget-table">
            <thead>
              <tr>
                <th>Budget term</th>
                <th>A → B</th>
                <th>B → A</th>
              </tr>
            </thead>
            <tbody>
              {r.a_to_b.ledger.map((item, i) => (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>
                    {fmt(item.value_db)} <small>{item.unit}</small>
                  </td>
                  <td>
                    {fmt(r.b_to_a.ledger[i].value_db)}{" "}
                    <small>{item.unit}</small>
                  </td>
                </tr>
              ))}
              <tr className="subtotal">
                <th>Received power</th>
                <td>
                  {fmt(r.a_to_b.received_power_dbm)} <small>dBm</small>
                </td>
                <td>
                  {fmt(r.b_to_a.received_power_dbm)} <small>dBm</small>
                </td>
              </tr>
              <tr>
                <td>Receiver sensitivity</td>
                <td>
                  {fmt(r.a_to_b.sensitivity_dbm)} <small>dBm</small>
                </td>
                <td>
                  {fmt(r.b_to_a.sensitivity_dbm)} <small>dBm</small>
                </td>
              </tr>
              <tr className="margin-row">
                <th>Nominal link margin</th>
                <td>
                  {fmt(r.a_to_b.margin_db)} <small>dB</small>
                </td>
                <td>
                  {fmt(r.b_to_a.margin_db)} <small>dB</small>
                </td>
              </tr>
              <tr>
                <td>EIRP</td>
                <td>
                  {fmt(r.a_to_b.eirp_dbm)} <small>dBm</small>
                </td>
                <td>
                  {fmt(r.b_to_a.eirp_dbm)} <small>dBm</small>
                </td>
              </tr>
              <tr>
                <td>Thermal noise baseline at 290 K</td>
                <td>
                  {fmt(r.a_to_b.thermal_noise_dbm)} <small>dBm</small>
                </td>
                <td>
                  {fmt(r.b_to_a.thermal_noise_dbm)} <small>dBm</small>
                </td>
              </tr>
              <tr>
                <td>Thermal SNR (excludes interference)</td>
                <td>
                  {fmt(r.a_to_b.thermal_snr_db)} <small>dB</small>
                </td>
                <td>
                  {fmt(r.b_to_a.thermal_snr_db)} <small>dB</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="footnote">
          A: {r.project.a.name} · B: {r.project.b.name}. Forward bearing{" "}
          {fmt(r.azimuth_a_deg)}°, reverse {fmt(r.azimuth_b_deg)}° true.
        </p>
        <p className="footnote">
          A receiver condition:{" "}
          {r.project.a.sensitivity_condition || "Not specified"}. B receiver
          condition: {r.project.b.sensitivity_condition || "Not specified"}.
        </p>
      </section>
      <section className="panel evidence">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Know what is behind the numbers</span>
            <h2>
              <ShieldCheck size={19} /> Sources & assumptions
            </h2>
          </div>
          <span className="chip">v{r.engine_version}</span>
        </div>
        <div className="scope-grid">
          <div>
            <span className="eyebrow">Availability</span>
            <h3>Not modeled</h3>
            <p>{r.availability.reason}</p>
          </div>
          <div>
            <span className="eyebrow">Regulatory status</span>
            <h3>Not screened</h3>
            <p>{r.regulatory.reason}</p>
          </div>
        </div>
        <ul className="warnings">
          {r.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        {r.sources.length > 0 && (
          <div className="source-list">
            {r.sources.map((s) => (
              <article key={s.id}>
                <h3>
                  {s.url && s.url.startsWith("https://") ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.name}
                      <ArrowUpRight size={14} />
                    </a>
                  ) : (
                    s.name
                  )}
                </h3>
                <p>{s.vertical_datum}</p>
                {s.acquisition_start && (
                  <p>
                    Acquired {s.acquisition_start} to {s.acquisition_end} ·
                    published {s.publication_date} · {s.sample_count} samples
                  </p>
                )}
                {s.resolution_note && <p>{s.resolution_note}</p>}
              </article>
            ))}
          </div>
        )}
        <p className="footnote">
          Model: {r.model_id}. Calculated{" "}
          {new Date(r.created_at).toLocaleString()}.
          {r.terrain_retrieved_at
            ? ` Terrain retrieved ${new Date(r.terrain_retrieved_at).toLocaleString()}.`
            : ""}{" "}
          {r.terrain_index.status
            ? `USGS 1 m coverage index: ${r.terrain_index.status}; intersections do not guarantee full-path coverage.`
            : ""}
        </p>
        <details className="method">
          <summary>Calculation method & project inputs</summary>
          <p>
            WGS84 ellipsoidal distance and bearings use GeographicLib.
            Free-space loss is 20 log₁₀(4πdf/c). The first Fresnel radius is
            √(λd₁d₂ / D). Margin is received power minus your receiver
            sensitivity. Added losses are user-entered allowances and must not
            overlap. Neither a statistical propagation confidence interval nor
            an annual availability prediction is included.
          </p>
          <pre>{JSON.stringify(r.project, null, 2)}</pre>
        </details>
      </section>
    </div>
  );
}
