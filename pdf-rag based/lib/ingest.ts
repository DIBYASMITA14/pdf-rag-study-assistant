import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import fs from "fs/promises";
import { embedTexts } from "./embeddings";
import { storeVectors, deleteVectorsForFile } from "./vectorstore";

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse-fork");

export async function ingestPDF(filePath: string, filename: string): Promise<{ chunkCount: number }> {
  console.log(`\n========================================`);
  console.log(`[INGESTION START] Processing file: "${filename}"`);
  console.log(`========================================`);

  // ----------------------------------------------------
  // STAGE 1: READ & PARSE PDF
  // ----------------------------------------------------
  console.log(`[Stage 1/4: PARSING] Reading binary file: ${filePath}`);
  const dataBuffer = await fs.readFile(filePath);
  console.log(`[Stage 1/4: PARSING] Buffer size: ${(dataBuffer.length / 1024).toFixed(1)} KB. Extracting text...`);

  const pageDocs: Document[] = [];
  let totalExtractedText = "";

  try {
    const pageRender = async function (pageData: any) {
      const textContent = await pageData.getTextContent();
      let pageText = "";
      for (const item of textContent.items) {
        pageText += (item.str || "") + " ";
      }
      const cleanedText = pageText.trim();
      if (cleanedText.length > 0) {
        pageDocs.push(
          new Document({
            pageContent: cleanedText,
            metadata: {
              source: filename,
              page: pageData.pageIndex + 1,
            },
          })
        );
      }
      return pageText;
    };

    const pdfData = await pdf(dataBuffer, { pagerender: pageRender });
    totalExtractedText = pdfData.text ? pdfData.text.trim() : "";
    console.log(`[Stage 1/4: PARSING] PDF parsed: ${pdfData.numpages} page(s), ${totalExtractedText.length} characters.`);
  } catch (parseError: any) {
    console.error(`[Stage 1/4: PARSING ERROR] Failed to parse PDF structure:`, parseError);
    throw new Error(`PDF parsing failed: ${parseError.message}`);
  }

  // Reject empty / scanned / image-only PDFs with informative guidance
  if (!totalExtractedText || totalExtractedText.length < 10) {
    console.warn(`[Stage 1/4: WARNING] Extracted text is empty or too short (${totalExtractedText.length} chars).`);
    throw new Error(
      `The PDF "${filename}" contains no extractable text. Scanned or image-only PDFs require OCR and cannot be indexed directly.`
    );
  }

  const rawDocs: Document[] = pageDocs.length > 0 
    ? pageDocs 
    : [new Document({ pageContent: totalExtractedText, metadata: { source: filename, page: 1 } })];

  // ----------------------------------------------------
  // STAGE 2: CHUNKING
  // ----------------------------------------------------
  console.log(`[Stage 2/4: CHUNKING] Splitting ${rawDocs.length} page(s) into chunks (size: 500, overlap: 50)...`);
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const docs = await textSplitter.splitDocuments(rawDocs);

  if (!docs || docs.length === 0) {
    console.error(`[Stage 2/4: ERROR] No chunks generated from document.`);
    throw new Error(`Failed to split document into searchable text chunks.`);
  }

  console.log(`[Stage 2/4: CHUNKING] Generated ${docs.length} chunk(s).`);

  // ----------------------------------------------------
  // STAGE 3: EMBEDDING
  // ----------------------------------------------------
  console.log(`[Stage 3/4: EMBEDDING] Computing embeddings for ${docs.length} text chunks...`);
  const texts = docs.map((doc) => doc.pageContent);

  const embedStartTime = Date.now();
  let embeddingsArray: number[][];
  try {
    embeddingsArray = await embedTexts(texts);
    const durationMs = Date.now() - embedStartTime;
    console.log(`[Stage 3/4: EMBEDDING] Generated ${embeddingsArray.length} embeddings in ${durationMs}ms (Dimension: ${embeddingsArray[0]?.length || 0}).`);
  } catch (embedError: any) {
    console.error(`[Stage 3/4: EMBEDDING ERROR] Embedding generation failed:`, embedError);
    throw new Error(`Embedding error: ${embedError.message}`);
  }

  // ----------------------------------------------------
  // STAGE 4: STORE IN VECTOR DB
  // ----------------------------------------------------
  console.log(`[Stage 4/4: VECTOR STORE] Ingesting vectors into database...`);
  await deleteVectorsForFile(filename);

  const metadatas = docs.map((doc, i) => ({
    source: filename,
    page: doc.metadata.page || 1,
    chunkIndex: i,
  }));

  const ids = docs.map((_, i) => `${filename}-chunk-${i}`);

  try {
    await storeVectors(ids, embeddingsArray, metadatas, texts);
    console.log(`[Stage 4/4: VECTOR STORE] Vector storage completed successfully.`);
  } catch (dbError: any) {
    console.error(`[Stage 4/4: VECTOR STORE ERROR] Storage failed:`, dbError);
    throw new Error(`Database error: ${dbError.message}`);
  }

  console.log(`========================================`);
  console.log(`[INGESTION COMPLETE] Successfully indexed "${filename}" with ${docs.length} chunks.`);
  console.log(`========================================\n`);

  return { chunkCount: docs.length };
}
