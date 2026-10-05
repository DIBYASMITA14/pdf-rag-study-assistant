import { getCollection, clearCollection, chromaClient } from "./chroma";
import { getEnvVariable } from "./env";
import fs from "fs/promises";
import path from "path";
import os from "os";

export interface VectorDocument {
  id: string;
  embedding: number[];
  metadata: {
    source: string;
    page: number;
    chunkIndex: number;
  };
  document: string;
}

// Local in-memory store with disk caching fallback
class LocalVectorStore {
  private docs: VectorDocument[] = [];
  private cachePath: string;
  private loadPromise: Promise<void>;

  constructor() {
    const tmpDir = path.join(os.tmpdir(), "pdf-chatbot-store");
    this.cachePath = path.join(tmpDir, "local_vectors.json");
    this.loadPromise = this.loadFromDisk();
  }

  private async loadFromDisk() {
    try {
      const data = await fs.readFile(this.cachePath, "utf-8");
      this.docs = JSON.parse(data);
      console.log(`[LocalStore] Loaded ${this.docs.length} vectors from cache.`);
    } catch {
      this.docs = [];
    }
  }

  public async ensureLoaded() {
    await this.loadPromise;
  }

  private async saveToDisk() {
    try {
      const tmpDir = path.dirname(this.cachePath);
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(this.cachePath, JSON.stringify(this.docs), "utf-8");
    } catch (e) {
      console.warn("[LocalStore] Could not persist to disk:", e);
    }
  }

  async upsert(ids: string[], embeddings: number[][], metadatas: any[], documents: string[]) {
    await this.ensureLoaded();
    // Remove existing with same ids
    const idSet = new Set(ids);
    this.docs = this.docs.filter(d => !idSet.has(d.id));

    for (let i = 0; i < ids.length; i++) {
      this.docs.push({
        id: ids[i],
        embedding: embeddings[i],
        metadata: metadatas[i],
        document: documents[i],
      });
    }

    await this.saveToDisk();
    console.log(`[LocalStore] Upserted ${ids.length} chunks. Total in store: ${this.docs.length}`);
  }

  async deleteWhere(sourceFilename: string) {
    await this.ensureLoaded();
    const prevCount = this.docs.length;
    this.docs = this.docs.filter(d => d.metadata?.source !== sourceFilename);
    await this.saveToDisk();
    console.log(`[LocalStore] Deleted ${prevCount - this.docs.length} chunks for source: ${sourceFilename}`);
  }

  getDistinctSources(): string[] {
    const set = new Set<string>();
    for (const d of this.docs) {
      if (d.metadata?.source) {
        set.add(d.metadata.source);
      }
    }
    return Array.from(set);
  }

  async getDistinctSourcesAsync(): Promise<string[]> {
    await this.ensureLoaded();
    return this.getDistinctSources();
  }

  async getChunksForDocumentAsync(filename?: string, maxChunks = 25): Promise<{ documents: string[]; metadatas: any[] }> {
    await this.ensureLoaded();
    return this.getChunksForDocument(filename, maxChunks);
  }

  getChunksForDocument(filename?: string, maxChunks = 25): { documents: string[]; metadatas: any[] } {
    let filtered = filename 
      ? this.docs.filter(d => d.metadata?.source === filename)
      : this.docs;
    
    if (filtered.length === 0) {
      filtered = this.docs;
    }

    if (filtered.length <= maxChunks) {
      return {
        documents: filtered.map(d => d.document),
        metadatas: filtered.map(d => d.metadata),
      };
    }

    // Evenly sample chunks across the document to get comprehensive coverage across all sections/chapters
    const step = filtered.length / maxChunks;
    const sampled: VectorDocument[] = [];
    for (let i = 0; i < maxChunks; i++) {
      const idx = Math.min(Math.floor(i * step), filtered.length - 1);
      sampled.push(filtered[idx]);
    }

    return {
      documents: sampled.map(d => d.document),
      metadatas: sampled.map(d => d.metadata),
    };
  }

  async clear() {
    this.docs = [];
    await this.saveToDisk();
    console.log(`[LocalStore] Cleared local vector store.`);
  }

  async count(): Promise<number> {
    await this.ensureLoaded();
    return this.docs.length;
  }

  async search(queryEmbedding: number[], nResults = 5) {
    await this.ensureLoaded();
    if (this.docs.length === 0) {
      return { documents: [[]], metadatas: [[]], distances: [[]] };
    }

    // Cosine similarity
    const scored = this.docs.map(doc => {
      let dot = 0;
      let normA = 0;
      let normB = 0;
      const len = Math.min(queryEmbedding.length, doc.embedding.length);

      for (let i = 0; i < len; i++) {
        dot += queryEmbedding[i] * doc.embedding[i];
        normA += queryEmbedding[i] * queryEmbedding[i];
        normB += doc.embedding[i] * doc.embedding[i];
      }

      const sim = (Math.sqrt(normA) * Math.sqrt(normB)) === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
      // Distance is 1 - similarity (closer to 0 is better)
      const distance = 1 - sim;
      return { doc, distance };
    });

    // Sort by smallest distance (highest similarity)
    scored.sort((a, b) => a.distance - b.distance);
    const topResults = scored.slice(0, nResults);

    return {
      documents: [topResults.map(r => r.doc.document)],
      metadatas: [topResults.map(r => r.doc.metadata)],
      distances: [topResults.map(r => r.distance)],
    };
  }
}

export const localStore = new LocalVectorStore();

// Check if remote Chroma server is accessible
async function isChromaAvailable(): Promise<boolean> {
  try {
    const hb = await chromaClient.heartbeat().catch(() => null);
    return hb !== null && hb !== undefined;
  } catch {
    return false;
  }
}

export async function storeVectors(
  ids: string[],
  embeddings: number[][],
  metadatas: any[],
  documents: string[]
) {
  const hasChroma = await isChromaAvailable();

  if (hasChroma) {
    try {
      console.log(`[VectorStore] Using ChromaDB at ${getEnvVariable("CHROMA_PATH", "localhost:8000")}...`);
      const collection = await getCollection("pdf_docs");
      await collection.upsert({ ids, embeddings, metadatas, documents });
      console.log(`[VectorStore] Upserted into ChromaDB successfully.`);
      return;
    } catch (e: any) {
      console.warn(`[VectorStore] ChromaDB write failed, falling back to Local Store:`, e.message);
    }
  }

  console.log(`[VectorStore] Storing in Local Vector Store (Standalone Mode)...`);
  await localStore.upsert(ids, embeddings, metadatas, documents);
}

export async function deleteVectorsForFile(filename: string) {
  const hasChroma = await isChromaAvailable();
  if (hasChroma) {
    try {
      const collection = await getCollection("pdf_docs");
      await collection.delete({ where: { source: filename } });
    } catch {}
  }
  await localStore.deleteWhere(filename);
}

export async function queryVectors(queryEmbedding: number[], nResults = 5) {
  const hasChroma = await isChromaAvailable();

  if (hasChroma) {
    try {
      const collection = await getCollection("pdf_docs");
      const res = await collection.query({ queryEmbeddings: [queryEmbedding], nResults });
      if (res.documents?.[0]?.length) {
        return res;
      }
    } catch (e: any) {
      console.warn(`[VectorStore] ChromaDB query failed, querying Local Store:`, e.message);
    }
  }

  console.log(`[VectorStore] Querying Local Vector Store...`);
  return await localStore.search(queryEmbedding, nResults);
}

export async function clearAllVectors() {
  const hasChroma = await isChromaAvailable();
  if (hasChroma) {
    try {
      await clearCollection("pdf_docs");
    } catch {}
  }
  await localStore.clear();
}

export async function getVectorCount(): Promise<{ count: number; engine: string; sources?: string[] }> {
  const sources = localStore.getDistinctSources();
  const hasChroma = await isChromaAvailable();
  if (hasChroma) {
    try {
      const collection = await getCollection("pdf_docs");
      const count = await collection.count();
      return { count, engine: "ChromaDB (Connected)", sources };
    } catch {}
  }

  const count = await localStore.count();
  return { count, engine: "Local Vector Engine (Active)", sources };
}

export async function getDocumentContext(filename?: string, maxChunks = 25): Promise<{ documents: string[]; metadatas: any[] }> {
  return await localStore.getChunksForDocumentAsync(filename, maxChunks);
}
