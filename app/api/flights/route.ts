import { NextRequest, NextResponse } from "next/server";
import { fetchRealFlights, haversineNm, Viewport } from "@/lib/adsb";
import {
  fetchPirepTurbulence,
  fetchJetStreamTurbulence,
} from "@/lib/turbulence";
import { simulatedZones, simulatedFlights } from "@/lib/simulated";
import { Flight, TurbulenceEvent } from "@/lib/types";

export const runtime = "edge";
export const revalidate = 20;

// Rendering thousands of markers freezes mobile browsers; the radar only
// needs the interesting traffic.
const MAX_FLIGHTS = 500;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  // Viewport from the client map (centre + radius). Falls back to a busy
  // default region so the very first paint still shows real traffic.
  const view: Viewport = {
    lat: num(searchParams.get("lat"), 50.5),
    lon: num(searchParams.get("lon"), 6.0),
    distNm: num(searchParams.get("dist"), 220),
  };

  const [realFlights, pireps, jet] = await Promise.all([
    fetchRealFlights(view),
    fetchPirepTurbulence(),
    fetchJetStreamTurbulence(view),
  ]);

  const flightsLive = realFlights.length > 0;

  // Real turbulence = pilot reports + jet-stream CAT zones. Only synthesise
  // zones if BOTH real sources came back empty.
  let turbulenceZones: TurbulenceEvent[] = [...pireps, ...jet];
  const turbLive = turbulenceZones.length > 0;
  if (!turbLive) turbulenceZones = simulatedZones();

  const rawFlights = flightsLive ? realFlights : simulatedFlights();

  // Annotate flights inside a turbulence zone (within ~6000 ft vertically).
  const annotated: Flight[] = rawFlights.map((flight) => {
    const altFt = flight.altitude * 3.28084;
    const match = turbulenceZones.find((zone) => {
      const dist = haversineNm(flight.latitude, flight.longitude, zone.lat, zone.lon);
      const altDiff = Math.abs(altFt - zone.altitudeFt);
      return dist <= zone.radiusNm && altDiff < 6000;
    });
    return match ? { ...flight, turbulence: match } : flight;
  });

  // Turbulent flights always survive the cap.
  const turbulent = annotated.filter((f) => f.turbulence);
  const calm = annotated.filter((f) => !f.turbulence);
  const flights = [
    ...turbulent,
    ...calm.slice(0, Math.max(0, MAX_FLIGHTS - turbulent.length)),
  ];

  const source =
    flightsLive && turbLive ? "live" : flightsLive || turbLive ? "mixed" : "simulated";

  return NextResponse.json(
    {
      flights,
      turbulenceZones,
      source,
      flightsLive,
      turbLive,
      totalFlights: annotated.length,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
      },
    }
  );
}

function num(v: string | null, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
