import "dotenv/config";
import fs from "fs";
import path from "path";
import { getEmbedding } from "./create_embedding";
import { loadDocuments } from "./convert-file-text";
import { chunkText } from "./chunk-text";

export interface DocumentChunk {
  id: string;
  source: string;
  text: string;
}

export interface IndexedChunk {
  id: string;
  source: string;
  text: string;
  embedding: number[];
}

export async function buildIndex(
  chunks: DocumentChunk[]
): Promise<IndexedChunk[]> {
  const indexedChunks: IndexedChunk[] = [];

  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk.text);

    indexedChunks.push({
      id: chunk.id,
      source: chunk.source,
      text: chunk.text,
      embedding,
    });
  }

  return indexedChunks;
}

export function saveIndex(indexedChunks: IndexedChunk[]): void {
  const dataDir = path.join(process.cwd(), "data");
  const outputPath = path.join(dataDir, "rag-index.json");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(
    outputPath,
    JSON.stringify(indexedChunks, null, 2),
    "utf-8"
  );

  console.log(`RAG index saved to ${outputPath}`);
}

async function main(): Promise<void> {
  const documents = await loadDocuments();
  const chunks: DocumentChunk[] = [];

  for (
    let documentIndex = 0;
    documentIndex < documents.length;
    documentIndex++
  ) {
    const document = documents[documentIndex];
    const textChunks = chunkText(document.content);

    for (let chunkIndex = 0; chunkIndex < textChunks.length; chunkIndex++) {
      chunks.push({
        id: `doc-${documentIndex}-chunk-${chunkIndex}`,
        source: document.title,
        text: textChunks[chunkIndex],
      });
    }
  }

  const indexedChunks = await buildIndex(chunks);
  saveIndex(indexedChunks);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
