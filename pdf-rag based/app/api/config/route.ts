import { NextRequest, NextResponse } from "next/server";
import { updateEnvVariable, getEnvironmentDiagnostics } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { groqApiKey, huggingfaceApiKey, chromaPath } = body;

    let updated = false;

    if (typeof groqApiKey === "string" && groqApiKey.trim().length > 0) {
      updateEnvVariable("GROQ_API_KEY", groqApiKey.trim());
      updated = true;
    }

    if (typeof huggingfaceApiKey === "string" && huggingfaceApiKey.trim().length > 0) {
      updateEnvVariable("HUGGINGFACE_API_KEY", huggingfaceApiKey.trim());
      updated = true;
    }

    if (typeof chromaPath === "string" && chromaPath.trim().length > 0) {
      updateEnvVariable("CHROMA_PATH", chromaPath.trim());
      updated = true;
    }

    const envStatus = getEnvironmentDiagnostics();

    return NextResponse.json({
      success: true,
      message: updated ? "Configuration successfully saved to .env.local!" : "No configuration updates provided.",
      environment: envStatus,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update configuration." },
      { status: 500 }
    );
  }
}
