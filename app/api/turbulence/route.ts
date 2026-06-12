import { NextRequest, NextResponse } from "next/server";
import { fetchPirepTurbulence, fetchJetStreamTurbulence } from "@/lib/turbulence";
import { simulatedZones } from "@/lib/simulated";
import { Viewport } from "@/lib/adsb";

export const runtime = "edge";
export const revalidate = 120;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const view: Viewport = {
    lat: Number(searchParams.get("lat") ?? 50.5),
    lon: Number(searchParams.get("lon") ?? 6.0),
    distNm: Number(searchParams.get("dist") ?? 220),
  };

  const [pireps, jet] = await Promise.all([
    fetchPirepTurbulence(),
    fetchJetStreamTurbulence(view),
  ]);

  let zones = [...pireps, ...jet];
  const live = zones.length > 0;
  if (!live) zones = simulatedZones();

  return NextResponse.json(
    { zones, source: live ? "live" : "simulated", count: zones.length },
    {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=180",
      },
    }
  );
}
