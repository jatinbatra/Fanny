import { NextRequest, NextResponse } from "next/server";
import { fetchFlights, haversineNm } from "@/lib/opensky";
import { fetchTurbulencePIREPs } from "@/lib/aviation-weather";
import { simulatedZones, simulatedFlights } from "@/lib/simulated";
import { Flight, TurbulenceEvent } from "@/lib/types";

export const runtime = "edge";
export const revalidate = 30;

// Cap what we send to the client — rendering thousands of markers
// freezes mobile browsers, and the panel only needs the interesting ones.
const MAX_FLIGHTS = 400;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const minLat = searchParams.get("minLat");
  const maxLat = searchParams.get("maxLat");
  const minLon = searchParams.get("minLon");
  const maxLon = searchParams.get("maxLon");

  const bbox =
    minLat && maxLat && minLon && maxLon
      ? {
          minLat: Number(minLat),
          maxLat: Number(maxLat),
          minLon: Number(minLon),
          maxLon: Number(maxLon),
        }
      : undefined;

  const [liveFlights, pirepZones] = await Promise.all([
    fetchFlights(bbox),
    fetchTurbulencePIREPs(),
  ]);

  const flightsLive = liveFlights.length > 0;
  const zonesLive = pirepZones.length > 0;

  const turbulenceZones: TurbulenceEvent[] = zonesLive
    ? pirepZones
    : simulatedZones();
  const rawFlights = flightsLive ? liveFlights : simulatedFlights();

  // Annotate flights that are inside a turbulence zone
  const annotated: Flight[] = rawFlights.map((flight) => {
    const altFt = flight.altitude * 3.28084;
    const match = turbulenceZones.find((zone) => {
      const dist = haversineNm(flight.latitude, flight.longitude, zone.lat, zone.lon);
      const altDiff = Math.abs(altFt - zone.altitudeFt);
      return dist <= zone.radiusNm && altDiff < 6000;
    });
    return match ? { ...flight, turbulence: match } : flight;
  });

  // Turbulent flights always make the cut; fill the rest up to the cap
  const turbulent = annotated.filter((f) => f.turbulence);
  const calm = annotated.filter((f) => !f.turbulence);
  const flights = [...turbulent, ...calm.slice(0, Math.max(0, MAX_FLIGHTS - turbulent.length))];

  return NextResponse.json(
    {
      flights,
      turbulenceZones,
      source: flightsLive && zonesLive ? "live" : flightsLive || zonesLive ? "mixed" : "simulated",
      flightsLive,
      zonesLive,
      totalFlights: annotated.length,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    }
  );
}
