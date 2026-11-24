import { resolve } from "node:path";
import { config } from "dotenv";
import OpenAI from "openai";

config({ path: resolve(__dirname, "../../.env"), quiet: true });

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error(
    "OPENAI_API_KEY is missing. Add it to the .env file."
  );
}

const client = new OpenAI({
  apiKey,
});

export async function getEmbedding(text: string): Promise<number[]> {
  const cleanedText = text
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanedText) {
    throw new Error("Cannot generate an embedding for empty text.");
  }

  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: cleanedText,
  });

  const embedding = response.data[0]?.embedding;

  if (!embedding) {
    throw new Error("The embedding API returned no embedding.");
  }

  return embedding;
}
