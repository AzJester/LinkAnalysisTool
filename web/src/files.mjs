export function parseProfileCsv(text) {
  if (text.length > 512000)
    throw new Error("The profile exceeds the 512 KB limit.");
  const lines = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 4 || lines.length > 2002)
    throw new Error("Include a header and 3 to 2,001 profile samples.");
  const headers = lines[0]
    .toLowerCase()
    .split(",")
    .map((v) => v.trim());
  const di = headers.indexOf("distance_m"),
    ei = headers.indexOf("elevation_m");
  if (di < 0 || ei < 0)
    throw new Error(
      "CSV needs distance_m and elevation_m columns, both in meters.",
    );
  const rows = lines.slice(1).map((line, i) => {
    const fields = line.split(",");
    if (!fields[di]?.trim() || !fields[ei]?.trim())
      throw new Error(`Missing value on row ${i + 2}.`);
    const distance_m = Number(fields[di]),
      elevation_m = Number(fields[ei]);
    if (
      !Number.isFinite(distance_m) ||
      !Number.isFinite(elevation_m) ||
      distance_m < 0 ||
      distance_m > 200001 ||
      elevation_m < -500 ||
      elevation_m > 9000
    )
      throw new Error(`Invalid distance or elevation on row ${i + 2}.`);
    return { distance_m, elevation_m };
  });
  if (
    rows[0].distance_m !== 0 ||
    rows.some((r, i) => i > 0 && r.distance_m <= rows[i - 1].distance_m)
  )
    throw new Error("Distances must start at 0 and increase strictly.");
  return rows;
}
export function parseProject(text) {
  if (text.length > 512000)
    throw new Error("The project exceeds the 512 KB limit.");
  const parsed = JSON.parse(text);
  const p = parsed.project || parsed;
  if (
    p.schema_version !== 1 ||
    !p.a ||
    !p.b ||
    typeof p.name !== "string" ||
    !Array.isArray(p.profile) ||
    !Array.isArray(p.obstacles)
  )
    throw new Error("This is not a version 1 Link Budget project.");
  const ranges = {
    latitude: [-89, 89],
    longitude: [-180, 180],
    antenna_height_m: [0.5, 300],
    tx_power_dbm: [-60, 60],
    tx_line_loss_db: [0, 60],
    antenna_gain_dbi: [-20, 60],
    rx_line_loss_db: [0, 60],
    rx_sensitivity_dbm: [-160, 0],
    noise_figure_db: [0, 40],
  };
  for (const site of [p.a, p.b]) {
    if (
      typeof site.name !== "string" ||
      !site.name.trim() ||
      site.name.length > 80 ||
      typeof site.sensitivity_condition !== "string" ||
      site.sensitivity_condition.length > 200
    )
      throw new Error("Invalid site name or receiver condition.");
    for (const [key, [min, max]] of Object.entries(ranges))
      if (
        typeof site[key] !== "number" ||
        !Number.isFinite(site[key]) ||
        site[key] < min ||
        site[key] > max
      )
        throw new Error(`Invalid site field: ${key}.`);
  }
  const limits = {
    frequency_ghz: [0.03, 100],
    bandwidth_mhz: [0.001, 320],
    k_factor: [0.5, 5],
    fresnel_fraction: [0, 1],
    additional_loss_db: [0, 100],
    polarization_loss_db: [0, 60],
    required_margin_db: [0, 60],
    clutter_height_m: [0, 100],
  };
  for (const [key, [min, max]] of Object.entries(limits))
    if (
      typeof p[key] !== "number" ||
      !Number.isFinite(p[key]) ||
      p[key] < min ||
      p[key] > max
    )
      throw new Error(`Invalid project field: ${key}.`);
  if (
    !["usgs", "none", "uploaded"].includes(p.terrain_mode) ||
    !p.name.trim() ||
    p.name.length > 100 ||
    typeof p.profile_source !== "string" ||
    p.profile_source.length > 200 ||
    p.profile.length > 2001 ||
    p.obstacles.length > 30
  )
    throw new Error("Invalid project settings.");
  if (p.terrain_mode === "uploaded") {
    parseProfileCsv(
      "distance_m,elevation_m\n" +
        p.profile.map((r) => `${r.distance_m},${r.elevation_m}`).join("\n"),
    );
  } else if (p.profile.length)
    throw new Error("Terrain samples require imported profile mode.");
  for (const o of p.obstacles)
    if (
      typeof o.name !== "string" ||
      !o.name.trim() ||
      o.name.length > 80 ||
      typeof o.fraction !== "number" ||
      !Number.isFinite(o.fraction) ||
      o.fraction <= 0 ||
      o.fraction >= 1 ||
      typeof o.height_m !== "number" ||
      !Number.isFinite(o.height_m) ||
      o.height_m < 0 ||
      o.height_m > 500
    )
      throw new Error("Invalid obstacle.");
  return p;
}
export function csvCell(value) {
  // Prevent spreadsheet formula interpretation of user-controlled labels.
  let s = String(value ?? "");
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function budgetCsv(result) {
  const rows = [
    ["Link Budget calculation", result.project.name],
    ["Generated UTC", result.created_at],
    ["Model", result.model_id],
    ["Engine", result.engine_version],
    ["Build", result.build_commit],
    ["Distance (m)", result.distance_m],
    ["Frequency (GHz)", result.project.frequency_ghz],
    ["Bandwidth (MHz)", result.project.bandwidth_mhz],
    ["Verdict", result.verdict],
    [],
    ["Term", "A to B", "B to A", "Unit"],
  ];
  result.a_to_b.ledger.forEach((r, i) =>
    rows.push([r.name, r.value_db, result.b_to_a.ledger[i].value_db, r.unit]),
  );
  rows.push(
    [
      "Received power",
      result.a_to_b.received_power_dbm,
      result.b_to_a.received_power_dbm,
      "dBm",
    ],
    [
      "Receiver sensitivity",
      result.a_to_b.sensitivity_dbm,
      result.b_to_a.sensitivity_dbm,
      "dBm",
    ],
    ["Nominal margin", result.a_to_b.margin_db, result.b_to_a.margin_db, "dB"],
    [
      "Target margin",
      result.project.required_margin_db,
      result.project.required_margin_db,
      "dB",
    ],
    [],
    ["Assumptions"],
  );
  result.warnings.forEach((w) => rows.push([w]));
  rows.push(
    ["Availability", result.availability.reason],
    ["Regulatory", result.regulatory.reason],
    [],
    ["Project inputs JSON", JSON.stringify(result.project)],
    ["Terrain sources JSON", JSON.stringify(result.sources)],
  );
  if (result.profile) {
    rows.push(
      [],
      [
        "distance_m",
        "bare_earth_m",
        "effective_earth_m",
        "obstruction_envelope_m",
        "antenna_ray_m",
        "clearance_m",
        "required_clearance_margin_m",
      ],
    );
    result.profile.samples.forEach((p) =>
      rows.push([
        p.distance_m,
        p.elevation_m,
        p.terrain_effective_m,
        p.obstruction_effective_m,
        p.ray_m,
        p.clearance_m,
        p.required_clearance_margin_m,
      ]),
    );
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
