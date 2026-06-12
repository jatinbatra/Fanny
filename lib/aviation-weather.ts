import { TurbulenceEvent, TurbulenceSeverity } from "./types";

// Aviation Weather Center (aviationweather.gov) — free, public API
// Fetches PIREP data for turbulence reports

export async function fetchTurbulencePIREPs(): Promise<TurbulenceEvent[]> {
  try {
    const url =
      "https://aviationweather.gov/api/data/pirep?age=2&type=json&format=json";
    const res = await fetch(url, { next: { revalidate: 120 } });
    if (!res.ok) throw new Error(`AWC API ${res.status}`);
    const data = await res.json();
    return parsePIREPs(data);
  } catch {
    // Return empty; the UI handles graceful degradation
    return [];
  }
}

function parsePIREPs(data: PIREPRaw[]): TurbulenceEvent[] {
  if (!Array.isArray(data)) return [];

  const events: TurbulenceEvent[] = [];

  for (const pirep of data) {
    const turbData = pirep.turb;
    if (!turbData || !pirep.lat || !pirep.lon) continue;

    const intensityCode =
      Array.isArray(turbData) ? turbData[0]?.intensity : turbData?.intensity;
    const severity = intensityToSeverity(intensityCode);
    if (!severity) continue;

    const altFt =
      pirep.fltlvl
        ? Number(pirep.fltlvl) * 100
        : pirep.altMsl
        ? Number(pirep.altMsl)
        : 30000;

    events.push({
      id: `pirep-${pirep.pirepId ?? pirep.receiptTime ?? Math.random()}`,
      severity,
      lat: Number(pirep.lat),
      lon: Number(pirep.lon),
      altitudeFt: altFt,
      radiusNm: 50,
      startTime: parseReceiptTime(pirep.receiptTime),
      source: "PIREP",
      rawText: pirep.rawOb ?? pirep.rawText ?? "",
      durationMinutes: 30,
    });
  }

  return events;
}

function intensityToSeverity(code: string | number | undefined): TurbulenceSeverity | null {
  if (code === undefined || code === null) return null;
  const c = String(code).toUpperCase().trim();
  if (["LGT", "LGTMOD", "LGT-MOD", "1", "2"].includes(c)) return "light";
  if (["MOD", "MODSVR", "MOD-SVR", "3", "4"].includes(c)) return "moderate";
  if (["SVR", "5", "6"].includes(c)) return "severe";
  if (["EXTRM", "EXTREME", "7"].includes(c)) return "extreme";
  return null;
}

function parseReceiptTime(ts?: string): number {
  if (!ts) return Date.now();
  try {
    return new Date(ts).getTime() || Date.now();
  } catch {
    return Date.now();
  }
}

interface PIREPRaw {
  pirepId?: string | number;
  receiptTime?: string;
  lat?: number | string;
  lon?: number | string;
  fltlvl?: number | string;
  altMsl?: number | string;
  turb?: { intensity?: string | number } | { intensity?: string | number }[];
  rawOb?: string;
  rawText?: string;
}

// Generate realistic-looking simulated turbulence zones for demo purposes
// when real API data is unavailable or sparse
export function generateSimulatedTurbulence(): TurbulenceEvent[] {
  const now = Date.now();
  const zones: Array<{
    lat: number; lon: number; severity: TurbulenceSeverity; alt: number; label: string;
  }> = [
    { lat: 51.5, lon: -0.1, severity: "moderate", alt: 35000, label: "North Atlantic jet stream" },
    { lat: 40.7, lon: -74.0, severity: "light", alt: 28000, label: "US East Coast" },
    { lat: 35.7, lon: 139.7, severity: "severe", alt: 40000, label: "Japan jet stream" },
    { lat: 48.9, lon: 2.3, severity: "moderate", alt: 33000, label: "European Alps" },
    { lat: -33.9, lon: 151.2, severity: "light", alt: 36000, label: "Tasman Sea" },
    { lat: 25.8, lon: -80.3, severity: "moderate", alt: 30000, label: "Gulf Stream" },
    { lat: 37.8, lon: -122.4, severity: "light", alt: 25000, label: "Pacific Coast" },
    { lat: 1.3, lon: 103.8, severity: "extreme", alt: 18000, label: "Tropical ITCZ" },
    { lat: 55.8, lon: 37.6, severity: "moderate", alt: 32000, label: "Siberian front" },
    { lat: 19.4, lon: -99.1, severity: "light", alt: 22000, label: "Mexican plateau" },
  ];

  return zones.map((z, i) => ({
    id: `sim-${i}`,
    severity: z.severity,
    lat: z.lat + (Math.random() - 0.5) * 2,
    lon: z.lon + (Math.random() - 0.5) * 2,
    altitudeFt: z.alt,
    radiusNm: z.severity === "extreme" ? 80 : z.severity === "severe" ? 60 : 40,
    startTime: now - Math.random() * 3600000,
    source: "SIMULATED",
    rawText: z.label,
    durationMinutes: Math.round(20 + Math.random() * 40),
  }));
}
