import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import { ingestPDF } from "@/lib/ingest";

export async function POST(request: NextRequest) {
  try {
    console.log(`\n[API /api/upload] Incoming POST upload request received.`);
    
    // 1. Parse FormData
    const formData = await request.formData();
    const file = formData.get("pdf") as File | null;

    if (!file) {
      console.warn(`[API /api/upload] No file attached with field key 'pdf'.`);
      return NextResponse.json({ error: "No PDF file provided in request." }, { status: 400 });
    }

    console.log(`[API /api/upload] File received: "${file.name}" (Size: ${(file.size / 1024).toFixed(1)} KB, MIME: ${file.type})`);

    // Verify extension / mime type
    const isPdfExt = file.name.toLowerCase().endsWith(".pdf");
    if (!isPdfExt && file.type !== "application/pdf") {
      console.warn(`[API /api/upload] Invalid file type: ${file.name} / ${file.type}`);
      return NextResponse.json(
        { error: "Invalid file format. Only PDF documents (.pdf) are supported." },
        { status: 400 }
      );
    }

    // 20MB file size limit check
    if (file.size > 20 * 1024 * 1024) {
      console.warn(`[API /api/upload] File size (${file.size} bytes) exceeds 20MB limit.`);
      return NextResponse.json({ error: "File exceeds maximum size limit of 20MB." }, { status: 400 });
    }

    // Prepare temp directory
    const tmpDir = path.join(os.tmpdir(), "pdf-chatbot-tmp");
    await mkdir(tmpDir, { recursive: true });

    // 2. Write file to temp location
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const tempFilePath = path.join(tmpDir, `${timestamp}-${safeName}`);

    console.log(`[API /api/upload] Writing buffer to temp file: ${tempFilePath}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tempFilePath, buffer);

    try {
      // 3. Call ingestPDF()
      console.log(`[API /api/upload] Starting ingestPDF for "${file.name}"...`);
      const { chunkCount } = await ingestPDF(tempFilePath, file.name);
      console.log(`[API /api/upload] Ingestion finished. Chunks: ${chunkCount}`);

      // 4. Delete the temp file after ingestion
      await unlink(tempFilePath).catch(() => {});
      console.log(`[API /api/upload] Temporary file cleaned up.`);

      // 5. Return success
      return NextResponse.json(
        { message: "File ingested successfully", chunkCount, filename: file.name },
        { status: 200 }
      );
    } catch (ingestionError: any) {
      // Cleanup on error
      await unlink(tempFilePath).catch(() => {});
      console.error(`[API /api/upload ERROR] Ingestion failed:`, ingestionError.message);
      return NextResponse.json(
        { 
          error: ingestionError.message || "Failed to process and ingest PDF.", 
          details: ingestionError.stack || ingestionError.message,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error(`[API /api/upload CRITICAL] Unhandled server error:`, error);
    return NextResponse.json(
      { error: "Internal server error during upload.", details: error.message },
      { status: 500 }
    );
  }
}
