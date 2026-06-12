import { Flight } from "./types";

// OpenSky Network — free public API, no key needed for read-only access
// Rate limit: 100 calls/day anonymous, 4000/day with account
// Docs: https://openskynetwork.github.io/opensky-api/rest.html

export async function fetchFlights(
  bbox?: { minLat: number; maxLat: number; minLon: number; maxLon: number }
): Promise<Flight[]> {
  try {
    let url = "https://opensky-network.org/api/states/all";
    if (bbox) {
      url += `?lamin=${bbox.minLat}&lamax=${bbox.maxLat}&lomin=${bbox.minLon}&lomax=${bbox.maxLon}`;
    }

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 15 },
    });

    if (!res.ok) throw new Error(`OpenSky API ${res.status}`);
    const json = await res.json();
    return parseOpenSkyStates(json.states ?? []);
  } catch {
    return [];
  }
}

// OpenSky state vector indices
const IDX = {
  ICAO24: 0, CALLSIGN: 1, ORIGIN_COUNTRY: 2, TIME_POSITION: 3,
  LAST_CONTACT: 4, LONGITUDE: 5, LATITUDE: 6, BARO_ALTITUDE: 7,
  ON_GROUND: 8, VELOCITY: 9, TRUE_TRACK: 10, VERTICAL_RATE: 11,
  GEO_ALTITUDE: 13,
};

function parseOpenSkyStates(states: (string | number | boolean | null)[][]): Flight[] {
  const flights: Flight[] = [];

  for (const s of states) {
    const lon = s[IDX.LONGITUDE] as number | null;
    const lat = s[IDX.LATITUDE] as number | null;
    const onGround = s[IDX.ON_GROUND] as boolean;

    if (!lon || !lat || onGround) continue;

    const altitude =
      ((s[IDX.GEO_ALTITUDE] ?? s[IDX.BARO_ALTITUDE]) as number | null) ?? 0;
    if (altitude < 1000) continue; // filter ground clutter

    const callsign = ((s[IDX.CALLSIGN] as string) ?? "").trim();

    flights.push({
      icao24: s[IDX.ICAO24] as string,
      callsign: callsign || (s[IDX.ICAO24] as string).toUpperCase(),
      originCountry: s[IDX.ORIGIN_COUNTRY] as string,
      longitude: lon,
      latitude: lat,
      altitude,
      velocity: (s[IDX.VELOCITY] as number) ?? 0,
      trueTrack: (s[IDX.TRUE_TRACK] as number) ?? 0,
      verticalRate: (s[IDX.VERTICAL_RATE] as number) ?? 0,
      onGround,
      lastContact: (s[IDX.LAST_CONTACT] as number) ?? 0,
    });
  }

  return flights;
}

// Check if a flight is inside a turbulence zone
// Uses haversine distance in nautical miles
export function haversineNm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
