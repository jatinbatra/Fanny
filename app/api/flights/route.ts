import { NextRequest, NextResponse } from "next/server";
import { fetchFlights, haversineNm } from "@/lib/opensky";
import { fetchTurbulencePIREPs, generateSimulatedTurbulence } from "@/lib/aviation-weather";
import { Flight, TurbulenceEvent } from "@/lib/types";

export const runtime = "edge";
export const revalidate = 15;

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

  const [rawFlights, pirepZones] = await Promise.all([
    fetchFlights(bbox),
    fetchTurbulencePIREPs(),
  ]);

  const turbulenceZones: TurbulenceEvent[] =
    pirepZones.length > 0 ? pirepZones : generateSimulatedTurbulence();

  // Annotate flights with turbulence if they're inside a zone
  const flights: Flight[] = rawFlights.map((flight) => {
    const altFt = flight.altitude * 3.28084;

    const match = turbulenceZones.find((zone) => {
      const dist = haversineNm(flight.latitude, flight.longitude, zone.lat, zone.lon);
      const altDiff = Math.abs(altFt - zone.altitudeFt);
      return dist <= zone.radiusNm && altDiff < 5000;
    });

    return match ? { ...flight, turbulence: match } : flight;
  });

  return NextResponse.json(
    { flights, turbulenceZones, source: pirepZones.length > 0 ? "live" : "simulated" },
    {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
      },
    }
  );
}
