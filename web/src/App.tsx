import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  FileJson,
  FolderOpen,
  HelpCircle,
  LoaderCircle,
  Plus,
  Printer,
  RadioTower,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Endpoint, Project, Result, SavedProject } from "./types";
import { cloneDefault } from "./data";
import {
  budgetCsv,
  download,
  parseProfileCsv,
  parseProject,
} from "./files.mjs";
import PathMap from "./PathMap";
import Results from "./Results";

const STORAGE = "link-budget-projects-v1";
type NumberField = {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  hint?: string;
};
function Field({ label, unit, value, min, max, onChange, hint }: NumberField) {
  return (
    <label className="field">
      <span>
        {label}
        {hint && (
          <span className="field-hint" title={hint} aria-label={hint}>
            <HelpCircle size={12} />
          </span>
        )}
      </span>
      <div className="input-with-unit">
        <input
          type="number"
          value={Number.isFinite(value) ? Number(value.toFixed(8)) : ""}
          min={min}
          max={max}
          step="any"
          required
          onChange={(e) =>
            onChange(e.target.value === "" ? NaN : Number(e.target.value))
          }
        />
        {unit && <span>{unit}</span>}
      </div>
    </label>
  );
}
function SiteEditor({
  site,
  id,
  imperial,
  update,
}: {
  site: Endpoint;
  id: "a" | "b";
  imperial: boolean;
  update: (v: Partial<Endpoint>) => void;
}) {
  return (
    <section
      className={`site-editor ${id}`}
      aria-label={`Site ${id.toUpperCase()} settings`}
    >
      <div className="site-heading">
        <b>{id.toUpperCase()}</b>
        <input
          aria-label={`Site ${id.toUpperCase()} name`}
          maxLength={80}
          required
          value={site.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </div>
      <div className="field-grid coordinates">
        <Field
          label={`Latitude ${id.toUpperCase()}`}
          unit="°"
          value={site.latitude}
          min={-89}
          max={89}
          step={0.00001}
          onChange={(latitude) => update({ latitude })}
        />
        <Field
          label={`Longitude ${id.toUpperCase()}`}
          unit="°"
          value={site.longitude}
          min={-180}
          max={180}
          step={0.00001}
          onChange={(longitude) => update({ longitude })}
        />
      </div>
      <div className="field-grid">
        <Field
          label={`Antenna height ${id.toUpperCase()}`}
          unit={imperial ? "ft AGL" : "m AGL"}
          value={site.antenna_height_m / (imperial ? 0.3048 : 1)}
          min={imperial ? 1.641 : 0.5}
          max={imperial ? 984.252 : 300}
          step={0.01}
          onChange={(v) =>
            update({ antenna_height_m: v * (imperial ? 0.3048 : 1) })
          }
          hint="Height above local ground, not elevation above sea level."
        />
        <Field
          label={`Antenna gain ${id.toUpperCase()}`}
          unit="dBi"
          value={site.antenna_gain_dbi}
          min={-20}
          max={60}
          onChange={(antenna_gain_dbi) => update({ antenna_gain_dbi })}
        />
      </div>
      <details className="radio-details">
        <summary>
          Radio & receiver <ChevronDown size={14} />
        </summary>
        <div className="field-grid">
          <Field
            label={`Transmit power ${id.toUpperCase()}`}
            unit="dBm"
            value={site.tx_power_dbm}
            min={-60}
            max={60}
            onChange={(tx_power_dbm) => update({ tx_power_dbm })}
          />
          <Field
            label={`Sensitivity ${id.toUpperCase()}`}
            unit="dBm"
            value={site.rx_sensitivity_dbm}
            min={-160}
            max={0}
            onChange={(rx_sensitivity_dbm) => update({ rx_sensitivity_dbm })}
          />
          <Field
            label={`TX feeder loss ${id.toUpperCase()}`}
            unit="dB"
            value={site.tx_line_loss_db}
            min={0}
            max={60}
            onChange={(tx_line_loss_db) => update({ tx_line_loss_db })}
          />
          <Field
            label={`RX feeder loss ${id.toUpperCase()}`}
            unit="dB"
            value={site.rx_line_loss_db}
            min={0}
            max={60}
            onChange={(rx_line_loss_db) => update({ rx_line_loss_db })}
          />
          <Field
            label={`Noise figure ${id.toUpperCase()}`}
            unit="dB"
            value={site.noise_figure_db}
            min={0}
            max={40}
            onChange={(noise_figure_db) => update({ noise_figure_db })}
          />
        </div>
        <label className="field condition">
          <span>Receiver performance condition {id.toUpperCase()}</span>
          <textarea
            rows={2}
            maxLength={200}
            value={site.sensitivity_condition}
            onChange={(e) => update({ sensitivity_condition: e.target.value })}
          />
        </label>
      </details>
    </section>
  );
}
function readSaved(): SavedProject[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "[]");
    return Array.isArray(saved)
      ? saved.slice(0, 20).filter((s) => {
          try {
            parseProject(JSON.stringify(s.project));
            return typeof s.id === "string";
          } catch {
            return false;
          }
        })
      : [];
  } catch {
    return [];
  }
}
async function jsonResponse(response: Response) {
  const body = await response
    .json()
    .catch(() => ({
      detail: "The server is starting or unavailable. Please retry shortly.",
    }));
  if (!response.ok)
    throw new Error(
      Array.isArray(body.detail)
        ? body.detail
            .map(
              (d: { loc: string[]; msg: string }) =>
                `${d.loc.slice(1).join(".")}: ${d.msg}`,
            )
            .join("; ")
        : body.detail || "Request failed.",
    );
  return body;
}

export default function App() {
  const [project, setProject] = useState<Project>(cloneDefault);
  const [result, setResult] = useState<Result | null>(null);
  const [imperial, setImperial] = useState(false);
  const [place, setPlace] = useState<"a" | "b" | null>(null);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<SavedProject[]>(readSaved),
    [savedId, setSavedId] = useState("");
  const [library, setLibrary] = useState(false),
    [help, setHelp] = useState(false),
    [exportOpen, setExportOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const job = useRef<{ id: string; token: string } | null>(null),
    controller = useRef<AbortController | null>(null);
  const projectImport = useRef<HTMLInputElement>(null),
    profileImport = useRef<HTMLInputElement>(null);
  const canonical = (p: Project) =>
    JSON.stringify(p, (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, value[k]]),
          )
        : value,
    );
  const stale =
    result !== null && canonical(result.project) !== canonical(project);
  function cancel() {
    controller.current?.abort();
    controller.current = null;
    if (job.current) {
      void fetch(`/api/runs/${job.current.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${job.current.token}` },
      }).catch(() => {});
      job.current = null;
    }
    setBusy("");
  }
  useEffect(
    () => () => {
      controller.current?.abort();
      if (job.current)
        void fetch(`/api/runs/${job.current.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${job.current.token}` },
          keepalive: true,
        }).catch(() => {});
    },
    [],
  );
  function update(next: Project) {
    cancel();
    setProject(next);
    setError("");
    setNotice("");
  }
  function patch(v: Partial<Project>) {
    update({ ...project, ...v });
  }
  function move(site: "a" | "b", latitude: number, longitude: number) {
    if (Math.abs(latitude) > 89) {
      setError("Use a latitude between 89° S and 89° N.");
      return;
    }
    update({
      ...project,
      [site]: {
        ...project[site],
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
      },
      ...(project.terrain_mode === "uploaded"
        ? { terrain_mode: "usgs" as const, profile: [] }
        : {}),
    });
    setPlace(null);
    if (project.terrain_mode === "uploaded")
      setNotice(
        "Endpoint moved. Imported terrain was cleared because it belongs to the previous path.",
      );
  }
  async function analyze() {
    // Reveal invalid inputs before native validation attempts to focus them.
    form.current
      ?.querySelectorAll<HTMLInputElement>("input,textarea")
      .forEach((input) => {
        if (!input.checkValidity())
          input.closest("details")?.setAttribute("open", "");
      });
    if (!form.current?.reportValidity()) return;
    cancel();
    setError("");
    setNotice("");
    setExportOpen(false);
    try {
      parseProject(JSON.stringify(project));
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const runController = new AbortController();
    controller.current = runController;
    setBusy("Submitting analysis");
    try {
      const created = await jsonResponse(
        await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(project),
          signal: runController.signal,
        }),
      );
      if (runController.signal.aborted) {
        void fetch(`/api/runs/${created.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${created.token}` },
        });
        return;
      }
      job.current = created;
      for (let i = 0; i < 200; i++) {
        if (runController.signal.aborted) return;
        const status = await jsonResponse(
          await fetch(`/api/runs/${created.id}`, {
            headers: { Authorization: `Bearer ${created.token}` },
            signal: runController.signal,
          }),
        );
        if (status.state === "complete") {
          setResult(status.result);
          setBusy("");
          job.current = null;
          return;
        }
        if (status.state === "failed" || status.state === "cancelled")
          throw new Error(status.error || "Analysis cancelled.");
        setBusy(
          status.state === "queued"
            ? "Waiting for an analysis slot"
            : project.terrain_mode === "usgs"
              ? "Sampling USGS terrain"
              : "Calculating the path",
        );
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      throw new Error("The analysis took too long. Please retry.");
    } catch (e) {
      if (!runController.signal.aborted) {
        setError((e as Error).message);
        cancel();
      }
    }
  }
  function saveProject() {
    try {
      parseProject(JSON.stringify(project));
      if (!savedId && saved.length >= 20)
        throw new Error(
          "This browser has 20 saved projects. Download a backup and remove one before saving another.",
        );
      const id = savedId || crypto.randomUUID();
      const next = [
        { id, savedAt: new Date().toISOString(), project },
        ...saved.filter((s) => s.id !== id),
      ];
      localStorage.setItem(STORAGE, JSON.stringify(next));
      setSaved(next);
      setSavedId(id);
      setNotice(
        "Project saved in this browser. Download JSON for a portable backup.",
      );
    } catch (e) {
      setError(`Could not save: ${(e as Error).message}`);
    }
  }
  function exportProject() {
    try {
      parseProject(JSON.stringify(project));
      download(
        JSON.stringify(project, null, 2),
        "link-budget-project.json",
        "application/json",
      );
      setExportOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importFile(
    file: File | undefined,
    kind: "project" | "profile",
  ) {
    if (!file) return;
    if (file.size > 512000) {
      setError("Choose a file smaller than 512 KB.");
      return;
    }
    try {
      const text = await file.text();
      if (kind === "project") {
        update(parseProject(text) as Project);
        setSavedId("");
        setResult(null);
        setNotice("Project imported. Run analysis to calculate fresh results.");
      } else {
        patch({
          terrain_mode: "uploaded",
          profile: parseProfileCsv(text),
          profile_source: file.name.slice(0, 200),
        });
        setNotice(
          "Profile imported. Confirm that both endpoints match this profile and that all elevations share one vertical reference.",
        );
      }
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
    }
  }
  const factor = imperial ? 0.3048 : 1;
  return (
    <>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="app-header">
        <a
          className="brand"
          href="https://st-dba.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="brand-icon">
            <RadioTower size={25} />
          </div>
          <div>
            <strong>LINK BUDGET</strong>
            <span>A THOUGHT CIRCUIT TOOL</span>
          </div>
        </a>
        <div className="header-right">
          <span className="public-tag">
            <i />
            Public workbench
          </span>
          <button
            className="icon-button"
            onClick={() => setHelp(!help)}
            aria-label="Help and methodology"
          >
            <HelpCircle size={20} />
          </button>
          <a className="home-link" href="https://st-dba.com">
            Thought Circuit <ArrowRight size={15} />
          </a>
        </div>
      </header>
      <main id="workspace">
        <section className="intro">
          <div>
            <p className="eyebrow">Point-to-point radio planning</p>
            <h1>Make the connection.</h1>
            <p>Trace your path. Check the terrain. Understand your margin.</p>
          </div>
          <div className="intro-note">
            <Activity size={20} />
            <p>
              Transparent calculations.
              <br />
              <strong>Your inputs. Your results.</strong>
            </p>
          </div>
        </section>
        {help && (
          <section className="help-panel panel">
            <button
              className="close-button"
              onClick={() => setHelp(false)}
              aria-label="Close help"
            >
              <X size={18} />
            </button>
            <h2>From two points to a defensible budget</h2>
            <ol>
              <li>
                Place endpoints on the map or enter WGS84 coordinates. Set
                antenna heights above ground.
              </li>
              <li>
                Enter the actual radio specifications, including receiver
                sensitivity at the intended channel width and modulation. The
                example values are illustrative.
              </li>
              <li>
                Run analysis. Inspect both directions, the controlling terrain
                point and the source metadata.
              </li>
              <li>
                Save a project in this browser, export JSON and CSV, or print a
                calculation report.
              </li>
            </ol>
            <p>
              Live terrain uses USGS 3DEP where available. For other regions,
              import a CSV with <code>distance_m,elevation_m</code>, beginning
              at zero and ending at the geodesic path length. All elevations
              must use one vertical reference. Paths are limited to 10 m through
              200 km and 2,001 samples.
            </p>
            <p>
              Free-space margin and sampled clearance are planning checks. This
              release does not calculate terrain diffraction, rain availability,
              area coverage, Wi-Fi throughput, frequency coordination or
              regulatory approval. Trees and buildings require user-entered
              allowances or obstacles.
            </p>
            <p>
              Projects stay in your browser unless you export them. Calculations
              send inputs to this service and endpoint coordinates to USGS.
              Basemap tiles are loaded from OpenStreetMap. Results expire from
              server memory after 15 minutes; terrain samples are cached for up
              to four hours. No account or ChatGPT service is required.
            </p>
            <a
              href="https://github.com/AzJester/LinkAnalysisTool"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source code, methods and development plan <ArrowRight size={14} />
            </a>
          </section>
        )}
        <div className="project-bar">
          <div className="project-title">
            <FolderOpen size={19} />
            <input
              aria-label="Project name"
              maxLength={100}
              required
              value={project.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
            <span className="chip">
              {savedId ? "Saved project" : "Example project"}
            </span>
          </div>
          <div className="project-actions">
            <button
              onClick={() => setLibrary(!library)}
              aria-expanded={library}
            >
              <FolderOpen size={16} />
              <span>Projects</span>
            </button>
            <button onClick={saveProject}>
              <Save size={16} />
              <span>Save</span>
            </button>
            <button onClick={() => projectImport.current?.click()}>
              <Upload size={16} />
              <span>Import</span>
            </button>
            <div className="export-wrap">
              <button
                onClick={() => setExportOpen(!exportOpen)}
                aria-expanded={exportOpen}
              >
                <ArrowDownToLine size={16} />
                <span>Export</span>
                <ChevronDown size={13} />
              </button>
              {exportOpen && (
                <div className="export-menu">
                  <button onClick={exportProject}>
                    <FileJson size={15} />
                    Project JSON
                  </button>
                  <button
                    disabled={!result || stale}
                    onClick={() => {
                      if (result)
                        download(
                          JSON.stringify(result, null, 2),
                          "link-budget-calculation.json",
                          "application/json",
                        );
                      setExportOpen(false);
                    }}
                  >
                    <FileJson size={15} />
                    Full calculation JSON
                  </button>
                  <button
                    disabled={!result || stale}
                    onClick={() => {
                      if (result)
                        download(
                          budgetCsv(result),
                          "link-budget-calculation.csv",
                          "text/csv",
                        );
                      setExportOpen(false);
                    }}
                  >
                    <ArrowDownToLine size={15} />
                    Budget & profile CSV
                  </button>
                  <button
                    disabled={!result || stale}
                    onClick={() => {
                      setExportOpen(false);
                      window.print();
                    }}
                  >
                    <Printer size={15} />
                    Print / save PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <input
          ref={projectImport}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="Import project JSON"
          onChange={(e) => {
            void importFile(e.target.files?.[0], "project");
            e.target.value = "";
          }}
        />
        <input
          ref={profileImport}
          type="file"
          accept=".csv,text/csv"
          className="visually-hidden"
          aria-label="Import terrain CSV"
          onChange={(e) => {
            void importFile(e.target.files?.[0], "profile");
            e.target.value = "";
          }}
        />
        {library && (
          <section className="library panel">
            <div className="panel-heading">
              <h2>Projects in this browser</h2>
              <button
                onClick={() => {
                  update(cloneDefault());
                  setSavedId("");
                  setResult(null);
                  setLibrary(false);
                }}
              >
                <Plus size={15} />
                New from example
              </button>
            </div>
            {saved.length === 0 ? (
              <p>No saved projects yet. Configure a link and choose Save.</p>
            ) : (
              saved.map((s) => (
                <div className="saved-row" key={s.id}>
                  <button
                    onClick={() => {
                      update(structuredClone(s.project));
                      setSavedId(s.id);
                      setResult(null);
                      setLibrary(false);
                    }}
                  >
                    <FolderOpen size={17} />
                    <span>
                      <strong>{s.project.name}</strong>
                      <small>{new Date(s.savedAt).toLocaleString()}</small>
                    </span>
                  </button>
                  <button
                    aria-label={`Remove saved project ${s.project.name}`}
                    onClick={() => {
                      const next = saved.filter((p) => p.id !== s.id);
                      try {
                        localStorage.setItem(STORAGE, JSON.stringify(next));
                        setSaved(next);
                        if (savedId === s.id) setSavedId("");
                        setNotice(
                          "Saved copy removed. The current workspace and downloaded backups are unchanged.",
                        );
                      } catch {
                        setError("Browser storage is unavailable.");
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
            <p className="footnote">
              Up to 20 projects. Browser storage can be cleared by your browser;
              export JSON to keep a backup.
            </p>
          </section>
        )}
        {notice && (
          <div className="notification" role="status">
            <Check size={17} />
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss message">
              <X size={16} />
            </button>
          </div>
        )}
        {error && (
          <div className="notification error" role="alert">
            <InfoIcon />
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="workspace-grid">
          <aside className="controls">
            <form
              ref={form}
              onSubmit={(e) => {
                e.preventDefault();
                void analyze();
              }}
              noValidate
            >
              <div className="controls-heading">
                <h2>
                  <Settings2 size={17} />
                  Link setup
                </h2>
                <div className="unit-toggle" aria-label="Display units">
                  <button
                    type="button"
                    aria-pressed={!imperial}
                    className={!imperial ? "active" : ""}
                    onClick={() => setImperial(false)}
                  >
                    m / km
                  </button>
                  <button
                    type="button"
                    aria-pressed={imperial}
                    className={imperial ? "active" : ""}
                    onClick={() => setImperial(true)}
                  >
                    ft / mi
                  </button>
                </div>
              </div>
              <SiteEditor
                site={project.a}
                id="a"
                imperial={imperial}
                update={(v) => {
                  if (
                    ("latitude" in v || "longitude" in v) &&
                    project.terrain_mode === "uploaded"
                  )
                    update({
                      ...project,
                      a: { ...project.a, ...v },
                      terrain_mode: "usgs",
                      profile: [],
                    });
                  else patch({ a: { ...project.a, ...v } });
                }}
              />
              <div className="connection-rule">
                <span />
                <RadioTower size={14} />
                <span />
              </div>
              <SiteEditor
                site={project.b}
                id="b"
                imperial={imperial}
                update={(v) => {
                  if (
                    ("latitude" in v || "longitude" in v) &&
                    project.terrain_mode === "uploaded"
                  )
                    update({
                      ...project,
                      b: { ...project.b, ...v },
                      terrain_mode: "usgs",
                      profile: [],
                    });
                  else patch({ b: { ...project.b, ...v } });
                }}
              />
              <section className="settings-section">
                <h3>Radio path</h3>
                <div className="field-grid">
                  <Field
                    label="Frequency"
                    unit="GHz"
                    value={project.frequency_ghz}
                    min={0.03}
                    max={100}
                    step={0.001}
                    onChange={(frequency_ghz) => patch({ frequency_ghz })}
                  />
                  <Field
                    label="Channel bandwidth"
                    unit="MHz"
                    value={project.bandwidth_mhz}
                    min={0.001}
                    max={320}
                    step={0.001}
                    onChange={(bandwidth_mhz) => patch({ bandwidth_mhz })}
                  />
                  <Field
                    label="Required margin"
                    unit="dB"
                    value={project.required_margin_db}
                    min={0}
                    max={60}
                    onChange={(required_margin_db) =>
                      patch({ required_margin_db })
                    }
                  />
                  <Field
                    label="Fresnel clearance"
                    unit="%"
                    value={project.fresnel_fraction * 100}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) => patch({ fresnel_fraction: v / 100 })}
                  />
                </div>
                <details className="advanced">
                  <summary>
                    Losses & curvature <ChevronDown size={14} />
                  </summary>
                  <div className="field-grid">
                    <Field
                      label="Additional path loss"
                      unit="dB"
                      value={project.additional_loss_db}
                      min={0}
                      max={100}
                      onChange={(additional_loss_db) =>
                        patch({ additional_loss_db })
                      }
                      hint="An independently established allowance. Do not count the same loss twice."
                    />
                    <Field
                      label="Polarization loss"
                      unit="dB"
                      value={project.polarization_loss_db}
                      min={0}
                      max={60}
                      onChange={(polarization_loss_db) =>
                        patch({ polarization_loss_db })
                      }
                    />
                    <Field
                      label="Effective Earth k"
                      value={project.k_factor}
                      min={0.5}
                      max={5}
                      step={0.00000001}
                      onChange={(k_factor) => patch({ k_factor })}
                    />
                    <Field
                      label="Uniform clutter"
                      unit={imperial ? "ft" : "m"}
                      value={project.clutter_height_m / factor}
                      min={0}
                      max={100 / factor}
                      step={0.01}
                      onChange={(v) => patch({ clutter_height_m: v * factor })}
                    />
                  </div>
                  <p className="footnote">
                    Clutter raises the obstruction envelope. It does not add
                    vegetation attenuation.
                  </p>
                </details>
              </section>
              <section className="settings-section terrain-settings">
                <h3>Terrain & obstacles</h3>
                <label className="field">
                  <span>Elevation source</span>
                  <select
                    value={project.terrain_mode}
                    onChange={(e) => {
                      if (e.target.value === "uploaded") {
                        profileImport.current?.click();
                      } else
                        patch({
                          terrain_mode: e.target
                            .value as Project["terrain_mode"],
                          profile: [],
                        });
                    }}
                  >
                    <option value="usgs">USGS 3DEP · live US terrain</option>
                    <option value="none">Budget only · no terrain check</option>
                    <option value="uploaded">Import terrain profile CSV</option>
                  </select>
                </label>
                {project.terrain_mode === "uploaded" && (
                  <p className="import-summary">
                    {project.profile.length} samples · {project.profile_source}
                    <button
                      type="button"
                      onClick={() => profileImport.current?.click()}
                    >
                      Replace profile
                    </button>
                  </p>
                )}
                <details className="advanced">
                  <summary>
                    Enter obstacles ({project.obstacles.length}){" "}
                    <ChevronDown size={14} />
                  </summary>
                  <p className="footnote">
                    Add a known tree or structure at a percentage of the
                    distance from A. Heights are above sampled ground.
                  </p>
                  {project.obstacles.map((o, i) => (
                    <div className="obstacle" key={i}>
                      <div className="obstacle-heading">
                        <input
                          aria-label={`Obstacle ${i + 1} name`}
                          required
                          maxLength={80}
                          value={o.name}
                          onChange={(e) =>
                            patch({
                              obstacles: project.obstacles.map((x, n) =>
                                n === i ? { ...x, name: e.target.value } : x,
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Remove obstacle ${i + 1}`}
                          onClick={() =>
                            patch({
                              obstacles: project.obstacles.filter(
                                (_, n) => n !== i,
                              ),
                            })
                          }
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <div className="field-grid">
                        <Field
                          label={`Position ${i + 1} from A`}
                          unit="%"
                          value={o.fraction * 100}
                          min={0.001}
                          max={99.999}
                          step={0.001}
                          onChange={(v) =>
                            patch({
                              obstacles: project.obstacles.map((x, n) =>
                                n === i ? { ...x, fraction: v / 100 } : x,
                              ),
                            })
                          }
                        />
                        <Field
                          label={`Obstacle ${i + 1} height`}
                          unit={imperial ? "ft" : "m"}
                          value={o.height_m / factor}
                          min={0}
                          max={500 / factor}
                          step={0.01}
                          onChange={(v) =>
                            patch({
                              obstacles: project.obstacles.map((x, n) =>
                                n === i ? { ...x, height_m: v * factor } : x,
                              ),
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    className="small-action"
                    type="button"
                    disabled={project.obstacles.length >= 30}
                    onClick={() =>
                      patch({
                        obstacles: [
                          ...project.obstacles,
                          {
                            name: `Obstacle ${project.obstacles.length + 1}`,
                            fraction: 0.5,
                            height_m: 10,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={14} />
                    Add obstacle
                  </button>
                </details>
              </section>
              <div className="run-controls">
                {busy ? (
                  <>
                    <button
                      type="button"
                      className="run-button working"
                      onClick={cancel}
                    >
                      <LoaderCircle size={18} className="spin" />
                      {busy}
                      <X size={17} />
                    </button>
                    <p>Click to cancel. Editing an input cancels this run.</p>
                  </>
                ) : (
                  <>
                    <button type="submit" className="run-button">
                      <Activity size={18} />
                      Run analysis
                      <ArrowRight size={18} />
                    </button>
                    <p>
                      10 m to 200 km · up to 2,001 samples
                      <br />6 requests / minute · terrain may take 90 seconds
                    </p>
                  </>
                )}
              </div>
            </form>
            <div className="example-note">
              <RotateCcw size={15} />
              <p>
                The Waterfall Valley example uses illustrative radio values.
                Replace them with your equipment specifications.
              </p>
            </div>
          </aside>
          <div className="analysis-column">
            <PathMap
              project={project}
              result={stale ? null : result}
              place={place}
              setPlace={setPlace}
              onPlace={move}
            />
            {result ? (
              <Results result={result} imperial={imperial} stale={stale} />
            ) : (
              <section className="ready-panel">
                <div className="ready-icon">
                  <RadioTower size={32} />
                </div>
                <div>
                  <span className="eyebrow">Your path, explained</span>
                  <h2>Two sites. One clear picture.</h2>
                  <p>
                    Run the example or place your own endpoints to see terrain
                    clearance, signal strength and the margin in each direction.
                  </p>
                  <div className="ready-features">
                    <span>
                      <Check size={14} />
                      Live USGS elevations
                    </span>
                    <span>
                      <Check size={14} />
                      Both directional budgets
                    </span>
                    <span>
                      <Check size={14} />
                      Portable reports
                    </span>
                  </div>
                  <button
                    onClick={() => void analyze()}
                    className="text-action"
                    disabled={!!busy}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle size={15} className="spin" />
                        {busy}
                      </>
                    ) : (
                      <>
                        Analyze this path
                        <ArrowRight size={15} />
                      </>
                    )}
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
      <footer>
        <span>
          <RadioTower size={15} />
          Link Budget <b>1.0</b> · Thought Circuit
        </span>
        <div>
          <button
            onClick={() => {
              setHelp(true);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            Methods & privacy
          </button>
          <a
            href="https://github.com/AzJester/LinkAnalysisTool"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://www.openstreetmap.org/fixthemap"
            target="_blank"
            rel="noopener noreferrer"
          >
            Map feedback
          </a>
        </div>
        <p>
          Independent planning tool. Verify equipment, terrain and regulatory
          requirements before deployment.
        </p>
      </footer>
    </>
  );
}
function InfoIcon() {
  return <HelpCircle size={17} />;
}
