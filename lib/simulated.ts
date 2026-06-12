import { Flight, TurbulenceEvent, TurbulenceSeverity } from "./types";

// Deterministic PRNG so simulated data is stable across serverless
// invocations — positions are a pure function of (seed, time).
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONE_TEMPLATES: Array<{
  lat: number; lon: number; severity: TurbulenceSeverity; alt: number; label: string;
}> = [
  { lat: 51.5, lon: -20.1, severity: "moderate", alt: 35000, label: "North Atlantic jet stream" },
  { lat: 40.7, lon: -74.0, severity: "light", alt: 28000, label: "US East Coast" },
  { lat: 35.7, lon: 139.7, severity: "severe", alt: 40000, label: "Japan jet stream" },
  { lat: 46.9, lon: 9.3, severity: "moderate", alt: 33000, label: "European Alps wave" },
  { lat: -33.9, lon: 151.2, severity: "light", alt: 36000, label: "Tasman Sea" },
  { lat: 25.8, lon: -80.3, severity: "moderate", alt: 30000, label: "Gulf Stream convection" },
  { lat: 37.8, lon: -122.4, severity: "light", alt: 25000, label: "Pacific Coast" },
  { lat: 1.3, lon: 103.8, severity: "extreme", alt: 18000, label: "Tropical ITCZ cell" },
  { lat: 55.8, lon: 37.6, severity: "moderate", alt: 32000, label: "Siberian front" },
  { lat: 19.4, lon: -99.1, severity: "light", alt: 22000, label: "Mexican plateau rotor" },
  { lat: 28.6, lon: 77.2, severity: "moderate", alt: 31000, label: "Himalayan jet exit" },
  { lat: -23.5, lon: -46.6, severity: "light", alt: 27000, label: "Brazilian highlands" },
];

// Zones are re-seeded every 30 minutes so they drift over time but stay
// stable between polls (notifications depend on consistent zone identity).
export function simulatedZones(now = Date.now()): TurbulenceEvent[] {
  const bucket = Math.floor(now / (30 * 60_000));

  return ZONE_TEMPLATES.map((z, i) => {
    const rnd = mulberry32(bucket * 1000 + i);
    const durationMinutes = Math.round(25 + rnd() * 50);
    return {
      id: `sim-${bucket}-${i}`,
      severity: z.severity,
      lat: z.lat + (rnd() - 0.5) * 3,
      lon: z.lon + (rnd() - 0.5) * 3,
      altitudeFt: z.alt,
      radiusNm: z.severity === "extreme" ? 90 : z.severity === "severe" ? 70 : 50,
      startTime: bucket * 30 * 60_000,
      source: "SIMULATED" as const,
      rawText: z.label,
      durationMinutes,
    };
  });
}

const AIRLINES = [
  "UAL", "DAL", "AAL", "BAW", "AFR", "DLH", "UAE", "SIA",
  "QFA", "ANA", "JAL", "ACA", "KLM", "RYR", "EZY", "IGO",
  "THY", "QTR", "CPA", "SWA",
];

const COUNTRIES = [
  "United States", "United Kingdom", "France", "Germany", "UAE",
  "Singapore", "Australia", "Japan", "Canada", "Netherlands",
  "Ireland", "India", "Turkey", "Qatar", "Hong Kong", "Brazil",
];

const FLIGHT_COUNT = 260;

// Each simulated flight orbits a fixed centre on a slow circular track.
// Position is derived from wall-clock time, so movement is smooth across
// polls and identical on every serverless instance. ~60% of flights orbit
// near a turbulence zone so they regularly fly through it (entering and
// leaving — which exercises the notification flow).
export function simulatedFlights(now = Date.now()): Flight[] {
  const zones = simulatedZones(now);
  const flights: Flight[] = [];
  const tMin = now / 60_000;

  for (let i = 0; i < FLIGHT_COUNT; i++) {
    const rnd = mulberry32(i + 1);

    let centerLat: number;
    let centerLon: number;
    let radiusDeg: number;
    let altitude: number;
    const zoneBound = i % 5 < 3;
    if (zoneBound) {
      // Tight orbit centred on a zone, at the zone's altitude — the track
      // repeatedly crosses in and out of the turbulence circle (zone radii
      // are 50–90nm ≈ 0.8–1.5°).
      const zone = zones[i % zones.length];
      centerLat = zone.lat + (rnd() - 0.5) * 0.6;
      centerLon = zone.lon + (rnd() - 0.5) * 0.6;
      radiusDeg = 0.4 + rnd() * 1.6;
      altitude = (zone.altitudeFt + (rnd() - 0.5) * 7000) / 3.28084;
    } else {
      centerLat = -55 + rnd() * 115; // -55..60
      centerLon = -180 + rnd() * 360;
      radiusDeg = 1.5 + rnd() * 5;
      altitude = 7600 + rnd() * 4600; // 25k–40k ft in metres
    }
    // ~450 kts ground speed → angular speed depends on orbit radius
    const degPerMin = 7.5 / 60; // ≈ 450 kts in latitude degrees
    const omega = degPerMin / radiusDeg; // radians/min
    const phase = rnd() * Math.PI * 2;
    const dir = rnd() > 0.5 ? 1 : -1;
    const theta = phase + dir * omega * tMin;

    const lat = centerLat + radiusDeg * Math.sin(theta);
    const lon =
      centerLon +
      (radiusDeg * Math.cos(theta)) / Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
    if (Math.abs(lat) > 85) continue;

    // Heading = orbit tangent: dLat ∝ cosθ·dir, dLon ∝ -sinθ·dir
    const heading =
      ((Math.atan2(-Math.sin(theta) * dir, Math.cos(theta) * dir) * 180) / Math.PI + 360) % 360;

    const airline = AIRLINES[Math.floor(rnd() * AIRLINES.length)];
    const flightNum = 100 + Math.floor(rnd() * 8900);

    flights.push({
      icao24: `sim${i.toString(16).padStart(3, "0")}`,
      callsign: `${airline}${flightNum}`,
      originCountry: COUNTRIES[Math.floor(rnd() * COUNTRIES.length)],
      longitude: ((lon + 540) % 360) - 180,
      latitude: lat,
      altitude,
      velocity: 210 + rnd() * 50,
      trueTrack: heading,
      verticalRate: (rnd() - 0.5) * 4,
      onGround: false,
      lastContact: Math.floor(now / 1000),
    });
  }

  return flights;
}
