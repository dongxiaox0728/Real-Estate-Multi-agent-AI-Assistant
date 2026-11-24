import { resolve } from "node:path";
import { config } from "dotenv";
import OpenAI from "openai";

config({ path: resolve(__dirname, "../../.env"), quiet: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getEmbedding(
  text: string
): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0].embedding;
}
