import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI;

function getClient() {
  if (!_client) {
    const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.Gemini_API_Key;
    if (!key) {
      throw new Error("API key missing from process.env! Available keys: " + Object.keys(process.env).join(", "));
    }
    // We instantiate exactly like gemini-research.ts
    _client = new GoogleGenAI({ apiKey: key });
  }
  return _client;
}

/**
 * Extracts a 768-dimensional semantic context vector utilizing Google's foundational 
 * text-embedding-004 model structure.
 * 
 * @param content The text metadata representing the Property, Zoning document, or Cost Record.
 * @returns A Float array representation suitable for cosine distance parsing inside Neon pgvector
 */
export async function generateContentEmbedding(content: string): Promise<number[]> {
  try {
    const ai = getClient();
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: [content],
      config: {
        outputDimensionality: 768, // Fixed explicitly for uniform cosine distances
      },
    });

    // The API natively packages the embeddings deep inside the object schema.
    const embedding = response?.embeddings?.[0]?.values;
    if (!embedding || !Array.isArray(embedding)) {
        throw new Error("Failed to extract structural embeddings from Google's response object.");
    }
    return embedding;
  } catch (err: any) {
    console.error("Vector ingestion exception:", err.message);
    throw new Error(`Embedding derivation failed: ${err.message}`);
  }
}
