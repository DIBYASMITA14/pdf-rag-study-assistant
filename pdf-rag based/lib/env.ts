import fs from "fs";
import path from "path";

/**
 * Parses simple .env file contents safely, stripping surrounding quotes and inline comments.
 */
function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();

    // Strip quotes if wrapped
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1).trim();
    }

    // Strip unquoted trailing comments
    const hashIdx = val.indexOf("#");
    if (hashIdx > -1) {
      val = val.substring(0, hashIdx).trim();
    }

    if (key) {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Resolves an environment variable by dynamically checking .env.local and .env files
 * across the project directory and parent workspace root on every call,
 * with fallback to process.env.
 */
export function getEnvVariable(key: string, defaultValue = ""): string {
  const candidateDirs = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "pdf-chatbot"),
  ];

  const envFilenames = [
    ".env.local",
    ".env.development.local",
    ".env.development",
    ".env",
  ];

  const checkedDirs = new Set<string>();

  for (const dir of candidateDirs) {
    if (checkedDirs.has(dir)) continue;
    checkedDirs.add(dir);

    for (const file of envFilenames) {
      const fullPath = path.join(dir, file);
      try {
        if (fs.existsSync(fullPath)) {
          const raw = fs.readFileSync(fullPath, "utf-8");
          const parsed = parseEnvContent(raw);
          const found = parsed[key];
          if (found && found.trim().length > 0) {
            const cleanVal = found.trim();
            // Sync into process.env so SDKs like groq-sdk can access it directly
            process.env[key] = cleanVal;
            return cleanVal;
          }
        }
      } catch {
        // Silently continue to next candidate
      }
    }
  }

  // Fallback to runtime process.env
  const fromProcess = process.env[key];
  if (fromProcess && fromProcess.trim().length > 0) {
    return fromProcess.trim();
  }

  return defaultValue;
}

/**
 * Safely updates or creates a key-value entry in .env.local on disk.
 */
export function updateEnvVariable(key: string, value: string): boolean {
  try {
    const envLocalPath = path.join(process.cwd(), ".env.local");
    let content = "";
    if (fs.existsSync(envLocalPath)) {
      content = fs.readFileSync(envLocalPath, "utf-8");
    }

    const keyRegex = new RegExp(`^(\\s*${key}\\s*=).*$`, "m");
    if (keyRegex.test(content)) {
      content = content.replace(keyRegex, `${key}=${value.trim()}`);
    } else {
      content = content ? `${content.trim()}\n${key}=${value.trim()}\n` : `${key}=${value.trim()}\n`;
    }

    fs.writeFileSync(envLocalPath, content, "utf-8");
    process.env[key] = value.trim();
    return true;
  } catch (err) {
    console.error("[Env] Failed to write .env.local:", err);
    return false;
  }
}

/**
 * Returns environment configuration health without exposing secret values.
 */
export function getEnvironmentDiagnostics() {
  const groqKey = getEnvVariable("GROQ_API_KEY");
  const hfKey = getEnvVariable("HUGGINGFACE_API_KEY");
  const chromaPath = getEnvVariable("CHROMA_PATH", "http://127.0.0.1:8000");

  const candidateDirs = [process.cwd(), path.resolve(process.cwd(), "..")];
  const detectedFiles: string[] = [];

  for (const dir of candidateDirs) {
    for (const file of [".env.local", ".env"]) {
      const fullPath = path.join(dir, file);
      try {
        if (fs.existsSync(fullPath)) {
          detectedFiles.push(path.basename(dir) + "/" + file);
        }
      } catch {}
    }
  }

  return {
    hasGroqKey: Boolean(groqKey && groqKey.length > 5),
    hasHuggingFaceKey: Boolean(hfKey && hfKey.length > 5),
    chromaPath: chromaPath || "http://127.0.0.1:8000 (default)",
    detectedFiles,
  };
}
