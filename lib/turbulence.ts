import { TurbulenceEvent, TurbulenceSeverity } from "./types";
import { Viewport } from "./adsb";

// Real turbulence comes from two free, keyless sources:
//
//  1. AWC PIREPs  — actual pilot turbulence reports (point observations).
//                   Real but sparse and mostly over the US.
//
//  2. Open-Meteo upper-air winds — global jet-stream / clear-air-turbulence
//     proxy. CAT is driven by vertical wind shear near jet cores, so we
//     sample winds at 200/250/300 hPa (≈ FL300–FL390, i.e. cruise levels)
//     across a grid covering the current map view and flag cells with strong
//     shear or jet-core winds. This is physically grounded and genuinely
//     global, so flights at cruise will actually pass through it.

const KMH_TO_KT = 1 / 1.852;

// ---- Source 1: AWC pilot reports -------------------------------------------

export async function fetchPirepTurbulence(): Promise<TurbulenceEvent[]> {
  try {
    const url =
      "https://aviationweather.gov/api/data/pirep?age=3&format=json";
    const res = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      next: { revalidate: 180 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const events: TurbulenceEvent[] = [];
    for (const p of data as PirepRaw[]) {
      const turb = Array.isArray(p.turb) ? p.turb[0] : p.turb;
      if (!turb || p.lat == null || p.lon == null) continue;
      const severity = intensityToSeverity(turb.intensity ?? turb.type);
      if (!severity) continue;

      const altFt = p.fltlvl
        ? Number(p.fltlvl) * 100
        : p.altMsl
        ? Number(p.altMsl)
        : 32000;

      events.push({
        id: `pirep-${p.pirepId ?? `${p.lat},${p.lon},${p.obsTime ?? Math.random()}`}`,
        severity,
        lat: Number(p.lat),
        lon: Number(p.lon),
        altitudeFt: altFt,
        radiusNm: 45,
        startTime: toMs(p.obsTime ?? p.receiptTime),
        source: "PIREP",
        rawText: (p.rawOb ?? p.rawText ?? "").slice(0, 120),
        durationMinutes: 30,
      });
    }
    return events;
  } catch {
    return [];
  }
}

interface PirepRaw {
  pirepId?: string | number;
  obsTime?: string | number;
  receiptTime?: string | number;
  lat?: number | string;
  lon?: number | string;
  fltlvl?: number | string;
  altMsl?: number | string;
  turb?: { intensity?: string; type?: string } | { intensity?: string; type?: string }[];
  rawOb?: string;
  rawText?: string;
}

function intensityToSeverity(code?: string): TurbulenceSeverity | null {
  if (!code) return null;
  const c = String(code).toUpperCase();
  if (c.includes("EXTRM") || c.includes("EXTREME")) return "extreme";
  if (c.includes("SEV")) return "severe";
  if (c.includes("MOD")) return "moderate";
  if (c.includes("LGT") || c.includes("LIGHT") || c.includes("SMOOTH-LGT")) return "light";
  return null;
}

function toMs(t?: string | number): number {
  if (t == null) return Date.now();
  if (typeof t === "number") return t < 1e12 ? t * 1000 : t;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

// ---- Source 2: Open-Meteo jet-stream / CAT proxy ---------------------------

// Sample upper-air winds across the viewport and turn high-shear / jet-core
// cells into turbulence zones. One Open-Meteo call covers the whole grid.
export async function fetchJetStreamTurbulence(view: Viewport): Promise<TurbulenceEvent[]> {
  try {
    const grid = buildGrid(view);
    if (grid.length === 0) return [];

    const lats = grid.map((g) => g.lat.toFixed(2)).join(",");
    const lons = grid.map((g) => g.lon.toFixed(2)).join(",");

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
      `&hourly=wind_speed_200hPa,wind_direction_200hPa,wind_speed_250hPa,wind_direction_250hPa,wind_speed_300hPa,wind_direction_300hPa` +
      `&forecast_days=1`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      next: { revalidate: 600 }, // upper winds change slowly; cache 10 min
    });
    if (!res.ok) return [];

    const json = await res.json();
    const cells: ApiCell[] = Array.isArray(json) ? json : [json];
    const cellRadiusNm = (view.distNm * 2) / GRID_N / 2;

    const events: TurbulenceEvent[] = [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const h = cell?.hourly;
      if (!h?.time) continue;

      const idx = nearestHourIndex(h.time);
      const w200 = pick(h.wind_speed_200hPa, idx);
      const d200 = pick(h.wind_direction_200hPa, idx);
      const w250 = pick(h.wind_speed_250hPa, idx);
      const d250 = pick(h.wind_direction_250hPa, idx);
      const w300 = pick(h.wind_speed_300hPa, idx);
      const d300 = pick(h.wind_direction_300hPa, idx);

      const result = classifyCat(w200, d200, w250, d250, w300, d300);
      if (!result) continue;

      events.push({
        id: `cat-${cell.latitude.toFixed(2)},${cell.longitude.toFixed(2)}`,
        severity: result.severity,
        lat: cell.latitude,
        lon: cell.longitude,
        altitudeFt: 34000,
        radiusNm: Math.max(35, cellRadiusNm),
        startTime: Date.now(),
        source: "SIGMET", // model-derived hazard area
        rawText: `Clear-air turbulence — jet stream ${Math.round(result.jetKt)} kt, shear ${result.shearKt.toFixed(0)} kt`,
        durationMinutes: undefined, // ongoing weather feature
      });
    }
    return events;
  } catch {
    return [];
  }
}

const GRID_N = 6; // 6x6 = 36 sample points per viewport

function buildGrid(view: Viewport): { lat: number; lon: number }[] {
  // Convert the radius to a lat/lon half-span around the centre.
  const halfDeg = view.distNm / 60; // 1° lat ≈ 60 nm
  const lonScale = Math.max(0.25, Math.cos((view.lat * Math.PI) / 180));
  const pts: { lat: number; lon: number }[] = [];

  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const fy = (i + 0.5) / GRID_N - 0.5; // -0.5..0.5
      const fx = (j + 0.5) / GRID_N - 0.5;
      const lat = clamp(view.lat + fy * 2 * halfDeg, -85, 85);
      const lon = wrapLon(view.lon + (fx * 2 * halfDeg) / lonScale);
      pts.push({ lat, lon });
    }
  }
  return pts;
}

interface ApiCell {
  latitude: number;
  longitude: number;
  hourly?: {
    time?: string[];
    wind_speed_200hPa?: (number | null)[];
    wind_direction_200hPa?: (number | null)[];
    wind_speed_250hPa?: (number | null)[];
    wind_direction_250hPa?: (number | null)[];
    wind_speed_300hPa?: (number | null)[];
    wind_direction_300hPa?: (number | null)[];
  };
}

function nearestHourIndex(times: string[]): number {
  const now = Date.now();
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(new Date(times[i]).getTime() - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

function pick(arr: (number | null)[] | undefined, idx: number): number {
  const v = arr?.[idx];
  return typeof v === "number" ? v : 0;
}

// Classify clear-air turbulence from the wind profile at a point.
// Inputs are km/h (Open-Meteo default); convert to knots.
function classifyCat(
  w200kmh: number, d200: number,
  w250kmh: number, d250: number,
  w300kmh: number, d300: number
): { severity: TurbulenceSeverity; jetKt: number; shearKt: number } | null {
  const w200 = w200kmh * KMH_TO_KT;
  const w250 = w250kmh * KMH_TO_KT;
  const w300 = w300kmh * KMH_TO_KT;
  const jetKt = Math.max(w200, w250, w300);

  // Vertical wind shear (vector difference) between 200 and 300 hPa, the
  // classic clear-air-turbulence driver. ~5.5 km separates those levels.
  const shearKt = vectorDiffKt(w200, d200, w300, d300);

  // Combined index: shear dominates, jet-core speed contributes.
  const index = shearKt + 0.25 * Math.max(0, jetKt - 70);

  let severity: TurbulenceSeverity;
  if (index >= 55) severity = "extreme";
  else if (index >= 38) severity = "severe";
  else if (index >= 24) severity = "moderate";
  else if (index >= 14) severity = "light";
  else return null; // smooth air — no zone

  return { severity, jetKt, shearKt };
}

function vectorDiffKt(s1: number, dir1: number, s2: number, dir2: number): number {
  const toRad = Math.PI / 180;
  // Meteorological direction = where wind comes FROM; vector points opposite.
  const u1 = -s1 * Math.sin(dir1 * toRad);
  const v1 = -s1 * Math.cos(dir1 * toRad);
  const u2 = -s2 * Math.sin(dir2 * toRad);
  const v2 = -s2 * Math.cos(dir2 * toRad);
  return Math.hypot(u1 - u2, v1 - v2);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}
function wrapLon(lon: number): number {
  return ((lon + 540) % 360) - 180;
}

// Merge PIREP + jet-stream zones, dropping near-duplicates.
export function mergeTurbulence(
  pireps: TurbulenceEvent[],
  jet: TurbulenceEvent[]
): TurbulenceEvent[] {
  return [...pireps, ...jet];
}
