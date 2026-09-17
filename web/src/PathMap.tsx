import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed, MousePointer2 } from "lucide-react";
import type { Project, Result } from "./types";

export default function PathMap({
  project,
  result,
  place,
  setPlace,
  onPlace,
}: {
  project: Project;
  result: Result | null;
  place: "a" | "b" | null;
  setPlace: (v: "a" | "b" | null) => void;
  onPlace: (site: "a" | "b", lat: number, lng: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const latest = useRef({ project, place, onPlace });
  latest.current = { project, place, onPlace };
  const [ready, setReady] = useState(false),
    [mapError, setMapError] = useState("");
  const fit = () => {
    const { a, b } = latest.current.project;
    if (
      ![a.latitude, a.longitude, b.latitude, b.longitude].every(Number.isFinite)
    )
      return;
    const end =
      b.longitude +
      (a.longitude - b.longitude > 180
        ? 360
        : a.longitude - b.longitude < -180
          ? -360
          : 0);
    map.current?.fitBounds(
      [
        [Math.min(a.longitude, end), Math.min(a.latitude, b.latitude)],
        [Math.max(a.longitude, end), Math.max(a.latitude, b.latitude)],
      ],
      { padding: 75, maxZoom: 15, duration: 500 },
    );
  };
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        center: [project.a.longitude, project.a.latitude],
        zoom: 12,
        attributionControl: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
              maxzoom: 19,
            },
          },
          layers: [
            {
              id: "base",
              type: "raster",
              source: "osm",
              paint: { "raster-saturation": -0.55, "raster-contrast": -0.1 },
            },
          ],
        },
      });
      map.current = instance;
      instance.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      instance.addControl(
        new maplibregl.AttributionControl({ compact: false }),
        "bottom-right",
      );
      instance.on("error", () =>
        setMapError(
          "Some map tiles could not load. Coordinates and calculations still work.",
        ),
      );
      instance.on("load", () => {
        instance.addSource("path", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [] },
          },
        });
        instance.addLayer({
          id: "path-halo",
          type: "line",
          source: "path",
          paint: { "line-color": "#fff", "line-width": 7, "line-opacity": 0.9 },
        });
        instance.addLayer({
          id: "path-line",
          type: "line",
          source: "path",
          paint: {
            "line-color": "#13766e",
            "line-width": 3,
            "line-dasharray": [2, 1],
          },
        });
        for (const site of ["a", "b"] as const) {
          const el = document.createElement("button");
          el.className = `map-marker ${site}`;
          el.textContent = site.toUpperCase();
          el.type = "button";
          el.setAttribute(
            "aria-label",
            `Site ${site.toUpperCase()}. Drag to move, or use coordinate fields.`,
          );
          const marker = new maplibregl.Marker({ element: el, draggable: true })
            .setLngLat([project[site].longitude, project[site].latitude])
            .addTo(instance);
          marker.on("dragend", () => {
            const p = marker.getLngLat();
            latest.current.onPlace(
              site,
              p.lat,
              ((((p.lng + 180) % 360) + 360) % 360) - 180,
            );
          });
          markers.current.push(marker);
        }
        setReady(true);
        fit();
      });
      instance.on("click", (e) => {
        if (latest.current.place)
          latest.current.onPlace(
            latest.current.place,
            e.lngLat.lat,
            ((((e.lngLat.lng + 180) % 360) + 360) % 360) - 180,
          );
      });
      const observer = new ResizeObserver(() => instance.resize());
      observer.observe(container.current);
      return () => {
        observer.disconnect();
        instance.remove();
        map.current = null;
        markers.current = [];
        setReady(false);
      };
    } catch {
      setMapError(
        "Interactive maps are unavailable in this browser. Enter coordinates below to analyze a path.",
      );
    }
    // Map instances are owned by this component; input updates are handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    const { a, b } = project;
    if (
      ![a.latitude, a.longitude, b.latitude, b.longitude].every(
        Number.isFinite,
      ) ||
      Math.abs(a.latitude) > 89 ||
      Math.abs(b.latitude) > 89 ||
      Math.abs(a.longitude) > 180 ||
      Math.abs(b.longitude) > 180
    )
      return;
    markers.current[0]?.setLngLat([a.longitude, a.latitude]);
    markers.current[1]?.setLngLat([b.longitude, b.latitude]);
    let coordinates = result?.profile?.samples
      .filter((p) => p.latitude !== undefined && p.longitude !== undefined)
      .map((p) => [p.longitude!, p.latitude!]);
    if (!coordinates?.length)
      coordinates = [
        [a.longitude, a.latitude],
        [b.longitude, b.latitude],
      ];
    // Unwrap the display line at the dateline without changing stored coordinates.
    for (let i = 1; i < coordinates.length; i++) {
      while (coordinates[i][0] - coordinates[i - 1][0] > 180)
        coordinates[i][0] -= 360;
      while (coordinates[i][0] - coordinates[i - 1][0] < -180)
        coordinates[i][0] += 360;
    }
    (map.current.getSource("path") as maplibregl.GeoJSONSource)?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    });
    map.current.getCanvas().style.cursor = place ? "crosshair" : "";
  }, [
    project.a.latitude,
    project.a.longitude,
    project.b.latitude,
    project.b.longitude,
    result,
    ready,
    place,
  ]);
  return (
    <section className="map-card" aria-label="Path map">
      <div ref={container} className="map-canvas" />
      <div className="map-tools">
        <span className="map-label">
          <MousePointer2 size={13} />{" "}
          {place
            ? `Click to place site ${place.toUpperCase()}`
            : "Explore your path"}
        </span>
        <div className="map-buttons">
          <button
            className={place === "a" ? "selected" : ""}
            aria-pressed={place === "a"}
            onClick={() => setPlace(place === "a" ? null : "a")}
          >
            Place A
          </button>
          <button
            className={place === "b" ? "selected" : ""}
            aria-pressed={place === "b"}
            onClick={() => setPlace(place === "b" ? null : "b")}
          >
            Place B
          </button>
          <button
            onClick={fit}
            title="Fit path to map"
            aria-label="Fit path to map"
          >
            <LocateFixed size={17} />
          </button>
        </div>
      </div>
      <div className="map-location">
        WGS84 <span>•</span>{" "}
        {result
          ? `${(result.distance_m / 1000).toFixed(2)} km path`
          : "Drag the markers or enter coordinates"}
      </div>
      {mapError && (
        <div className="map-error" role="status">
          {mapError}
        </div>
      )}
    </section>
  );
}
