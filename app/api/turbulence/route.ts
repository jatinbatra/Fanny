import { NextResponse } from "next/server";
import { fetchTurbulencePIREPs, generateSimulatedTurbulence } from "@/lib/aviation-weather";

export const runtime = "edge";
export const revalidate = 120;

export async function GET() {
  const pireps = await fetchTurbulencePIREPs();
  const zones = pireps.length > 0 ? pireps : generateSimulatedTurbulence();

  return NextResponse.json(
    { zones, source: pireps.length > 0 ? "live" : "simulated", count: zones.length },
    {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=180",
      },
    }
  );
}
