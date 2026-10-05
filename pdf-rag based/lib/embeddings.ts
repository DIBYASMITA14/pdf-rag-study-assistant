import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { getEnvVariable } from "./env";

let localPipeline: any = null;
let pipelineLoading: Promise<any> | null = null;

async function getLocalPipeline() {
  if (localPipeline) return localPipeline;
  if (pipelineLoading) return await pipelineLoading;

  pipelineLoading = (async () => {
    try {
      console.log("[Embeddings] Initializing local in-memory MiniLM pipeline (@xenova/transformers)...");
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = false;
      localPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      console.log("[Embeddings] Local MiniLM pipeline loaded successfully.");
      return localPipeline;
    } catch (err: any) {
      console.warn("[Embeddings] Could not load @xenova/transformers:", err.message);
      return null;
    } finally {
      pipelineLoading = null;
    }
  })();

  return await pipelineLoading;
}

// Fallback high-speed hash/dense semantic vector (384-dim) for instant offline operation
function generateFastDenseVector(text: string, dimensions = 384): number[] {
  const vector = new Array(dimensions).fill(0);
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 5381;
    for (let c = 0; c < word.length; c++) {
      hash = (hash * 33) ^ word.charCodeAt(c);
    }
    const idx = Math.abs(hash) % dimensions;
    const weight = 1 + Math.log(1 + 1 / (i + 1));
    vector[idx] += weight;
  }

  // L2 Normalize
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dimensions; i++) {
    vector[i] = vector[i] / norm;
  }

  return vector;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const hfApiKey = getEnvVariable("HUGGINGFACE_API_KEY");

  // 1. Try Hugging Face Inference API if key is present
  if (hfApiKey && hfApiKey.trim().length > 5) {
    try {
      console.log(`[Embeddings] Using Hugging Face Inference API for ${texts.length} texts...`);
      const hf = new HuggingFaceInferenceEmbeddings({
        apiKey: hfApiKey,
        model: "sentence-transformers/all-MiniLM-L6-v2",
      });
      return await hf.embedDocuments(texts);
    } catch (hfErr: any) {
      console.warn("[Embeddings] Hugging Face API failed, falling back to local extractor:", hfErr.message);
    }
  }

  // 2. Try Local Xenova Pipeline
  try {
    const extractor = await getLocalPipeline();
    if (extractor) {
      const results: number[][] = [];
      for (const text of texts) {
        const out = await extractor(text, { pooling: "mean", normalize: true });
        results.push(Array.from(out.data));
      }
      return results;
    }
  } catch (localErr: any) {
    console.warn("[Embeddings] Local Xenova extraction failed, using embedded dense vector engine:", localErr.message);
  }

  // 3. Ultra-reliable built-in dense vectors
  console.log(`[Embeddings] Generating ${texts.length} normalized dense vectors via embedded engine...`);
  return texts.map((t) => generateFastDenseVector(t));
}

export async function embedSingleText(text: string): Promise<number[]> {
  const res = await embedTexts([text]);
  return res[0];
}
