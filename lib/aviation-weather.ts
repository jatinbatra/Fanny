import { TurbulenceEvent, TurbulenceSeverity } from "./types";

// Aviation Weather Center (aviationweather.gov) — free, public API
// Fetches PIREP data for turbulence reports

export async function fetchTurbulencePIREPs(): Promise<TurbulenceEvent[]> {
  try {
    const url =
      "https://aviationweather.gov/api/data/pirep?age=2&type=json&format=json";
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 120 },
    });
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

// Simulated zones live in lib/simulated.ts — deterministic so they stay
// stable across polls and serverless instances.
export { simulatedZones as generateSimulatedTurbulence } from "./simulated";
