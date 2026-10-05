import { NextRequest, NextResponse } from "next/server";
import { clearAllVectors } from "@/lib/vectorstore";

export async function DELETE(request: NextRequest) {
  try {
    console.log(`[API /api/clear] Clearing vector database...`);
    await clearAllVectors();
    console.log(`[API /api/clear] Vector database cleared successfully.`);
    return NextResponse.json({ message: "Vector database cleared successfully." });
  } catch (error: any) {
    console.error(`[API /api/clear ERROR] Failed to clear vector database:`, error.message);
    return NextResponse.json(
      { error: "Failed to clear vector database", details: error.message },
      { status: 500 }
    );
  }
}
