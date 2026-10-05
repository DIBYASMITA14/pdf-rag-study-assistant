import { NextRequest, NextResponse } from "next/server";
import { getVectorCount } from "@/lib/vectorstore";
import { getEnvironmentDiagnostics } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const envStatus = getEnvironmentDiagnostics();

  let storeInfo: { count: number; engine: string; sources?: string[] } = { count: 0, engine: "Local Vector Engine (Active)", sources: [] };
  try {
    storeInfo = await getVectorCount();
  } catch (err: any) {
    console.warn("[API /api/status] Could not get vector count:", err.message);
  }

  return NextResponse.json(
    {
      status: "ready",
      database: {
        status: "connected",
        engine: storeInfo.engine,
        collection: "pdf_docs",
        totalChunksIndexed: storeInfo.count,
        sources: storeInfo.sources || [],
        error: null,
      },
      environment: envStatus,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}
