import { resolve } from "node:path";
import { config } from "dotenv";
import OpenAI from "openai";
import { RetrievedChunk } from "./retrieval";

config({ path: resolve(__dirname, "../../.env"), quiet: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateAnswer(
  query: string,
  chunks: RetrievedChunk[]
): Promise<string> {
  const context = chunks
    .map(
      (chunk, index) =>
        `[Source ${index + 1}: ${chunk.source}]\n${chunk.text}`
    )
    .join("\n\n");

  const response = await openai.responses.create({
    model: "gpt-5-mini",
    input: [
      {
        role: "system",
        content:
          "You are a real estate knowledge assistant. Answer the user's question using only the provided context. If the context does not contain enough information, say that the available documents do not provide enough information. Do not invent facts.",
      },
      {
        role: "user",
        content: `Context:\n\n${context}\n\nQuestion:\n${query}`,
      },
    ],
  });

  return response.output_text;
}
