import fs from "fs";
import path from "path";
import { IndexedChunk } from "./build-index";
import { retrieve } from "./retrieval";
import { generateAnswer } from "./generate-answer";

let cachedIndex: IndexedChunk[] | null = null;

export function loadKnowledgeIndex(): IndexedChunk[] {
  if (cachedIndex) {
    return cachedIndex;
  }

  const indexPath = path.resolve(
    __dirname,
    "..",
    "data",
    "rag-index.json"
  );

  const indexData = fs.readFileSync(indexPath, "utf-8");
  cachedIndex = JSON.parse(indexData) as IndexedChunk[];

  return cachedIndex;
}

export async function answerKnowledgeQuestion(
  query: string
): Promise<string> {
  const index = loadKnowledgeIndex();
  const retrievedChunks = await retrieve(query, index);

  return generateAnswer(query, retrievedChunks);
}
