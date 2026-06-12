import { Flight } from "./types";

// Real-time ADS-B from free community networks — no account or API key.
// These run on the readsb/tar1090 stack and work fine from cloud servers
// (unlike OpenSky, which now requires OAuth2 and blocks shared cloud IPs).
//
//   adsb.lol        https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{nm}
//   airplanes.live  https://api.airplanes.live/v2/point/{lat}/{lon}/{nm}
//   adsb.fi         https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{nm}
//
// All return the same aircraft.json shape: { ac: [ {hex, flight, lat, lon,
// alt_baro, gs, track, baro_rate, ...} ], ... }. Altitudes are feet and
// speeds knots here; we convert to the app's internal metric model.

const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;
const FPM_TO_MS = 0.00508;

// API hard cap on radius is 250 nm.
const MAX_DIST_NM = 250;

interface AdsbAircraft {
  hex?: string;
  flight?: string;
  r?: string; // registration
  t?: string; // aircraft type
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  seen_pos?: number;
}

const PROVIDERS = [
  (lat: number, lon: number, dist: number) =>
    `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
  (lat: number, lon: number, dist: number) =>
    `https://api.airplanes.live/v2/point/${lat}/${lon}/${dist}`,
  (lat: number, lon: number, dist: number) =>
    `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
];

export interface Viewport {
  lat: number;
  lon: number;
  distNm: number;
}

// Fetch real flights for a point + radius, trying each provider in turn
// until one answers. Returns [] only if every provider fails.
export async function fetchRealFlights(view: Viewport): Promise<Flight[]> {
  const lat = clamp(view.lat, -89, 89);
  const lon = clamp(view.lon, -179, 179);
  const dist = Math.min(Math.max(Math.round(view.distNm), 25), MAX_DIST_NM);

  for (const provider of PROVIDERS) {
    try {
      const res = await fetch(provider(lat, lon, dist), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(7000),
        next: { revalidate: 20 },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { ac?: AdsbAircraft[]; aircraft?: AdsbAircraft[] };
      const list = json.ac ?? json.aircraft ?? [];
      const flights = parseAircraft(list);
      if (flights.length > 0) return flights;
    } catch {
      // try next provider
    }
  }
  return [];
}

function parseAircraft(list: AdsbAircraft[]): Flight[] {
  const flights: Flight[] = [];

  for (const ac of list) {
    if (ac.lat == null || ac.lon == null || !ac.hex) continue;

    // alt_baro is "ground" for surface aircraft, or feet aloft.
    const rawAlt = ac.alt_baro ?? ac.alt_geom;
    if (rawAlt === "ground" || rawAlt == null) continue;
    const altFt = Number(rawAlt);
    if (!Number.isFinite(altFt) || altFt < 3000) continue; // skip departures/arrivals clutter

    // Drop very stale positions (>60s since last fix)
    if (typeof ac.seen_pos === "number" && ac.seen_pos > 60) continue;

    const callsign = (ac.flight ?? "").trim() || ac.r?.trim() || ac.hex.toUpperCase();
    const verticalFpm = ac.baro_rate ?? ac.geom_rate ?? 0;

    flights.push({
      icao24: ac.hex,
      callsign,
      originCountry: ac.t ? `Type ${ac.t}` : "—",
      longitude: ac.lon,
      latitude: ac.lat,
      altitude: altFt * FT_TO_M,
      velocity: (ac.gs ?? 0) * KT_TO_MS,
      trueTrack: ac.track ?? 0,
      verticalRate: verticalFpm * FPM_TO_MS,
      onGround: false,
      lastContact: Math.floor(Date.now() / 1000),
    });
  }

  return flights;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

// Haversine distance in nautical miles
export function haversineNm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3440.065; // Earth radius, nautical miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
