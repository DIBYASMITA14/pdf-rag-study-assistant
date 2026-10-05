import { ChromaClient } from "chromadb";
import { getEnvVariable } from "./env";

function createChromaClient(): ChromaClient {
  const rawPath = getEnvVariable("CHROMA_PATH", "http://127.0.0.1:8000");
  try {
    const urlToParse = rawPath.startsWith("http://") || rawPath.startsWith("https://") 
      ? rawPath 
      : `http://${rawPath}`;
    const chromaUrl = new URL(urlToParse);
    
    console.log(`[ChromaDB] Initializing client for host: ${chromaUrl.hostname}, port: ${chromaUrl.port || (chromaUrl.protocol === "https:" ? 443 : 80)}, ssl: ${chromaUrl.protocol === "https:"}`);
    
    return new ChromaClient({
      host: chromaUrl.hostname,
      port: parseInt(chromaUrl.port || (chromaUrl.protocol === "https:" ? "443" : "80")),
      ssl: chromaUrl.protocol === "https:",
    });
  } catch (error: any) {
    console.warn(`[ChromaDB] Failed to parse CHROMA_PATH (${rawPath}), falling back to default localhost:8000:`, error.message);
    return new ChromaClient({
      host: "127.0.0.1",
      port: 8000,
      ssl: false,
    });
  }
}

export const chromaClient = createChromaClient();

export async function getCollection(name: string = "pdf_docs") {
  try {
    console.log(`[ChromaDB] Getting or creating collection: "${name}"`);
    return await chromaClient.getOrCreateCollection({
      name,
      embeddingFunction: {
        generate: async () => []
      }
    });
  } catch (error: any) {
    console.error(`[ChromaDB] Failed to get/create collection "${name}":`, error.message);
    throw new Error(`ChromaDB connection failed: ${error.message}. Please verify ChromaDB is running at CHROMA_PATH (${process.env.CHROMA_PATH || "http://127.0.0.1:8000"}).`);
  }
}

export async function clearCollection(name: string = "pdf_docs") {
  try {
    console.log(`[ChromaDB] Clearing collection: "${name}"`);
    await chromaClient.deleteCollection({ name }).catch(() => {
      // Ignore if collection doesn't exist yet
    });
    return await chromaClient.createCollection({
      name,
      embeddingFunction: {
        generate: async () => []
      }
    });
  } catch (error: any) {
    console.error(`[ChromaDB] Failed to clear collection "${name}":`, error.message);
    throw new Error(`Failed to clear ChromaDB collection: ${error.message}`);
  }
}
