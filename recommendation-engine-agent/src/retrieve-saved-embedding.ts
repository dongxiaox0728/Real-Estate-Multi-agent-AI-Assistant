import fs from "node:fs/promises";
import path from "node:path";

import type { ListingEmbedding } from "./shared-types";

const EMBEDDING_FILE = path.resolve(
  __dirname,
  "..",
  "data",
  "listing_embeddings.json"
);

let cachedEmbeddings: ListingEmbedding[] | null = null;

async function loadEmbeddings(): Promise<ListingEmbedding[]> {
  if (cachedEmbeddings) {
    return cachedEmbeddings;
  }

  const fileContent = await fs.readFile(
    EMBEDDING_FILE,
    "utf8"
  );

  cachedEmbeddings = JSON.parse(
    fileContent
  ) as ListingEmbedding[];

  return cachedEmbeddings;
}

export async function getEmbeddingByListingId(
  listingId: string
): Promise<number[] | null> {
  const embeddings = await loadEmbeddings();

  const record = embeddings.find(
    (item) => item.listingId === listingId
  );

  return record?.embedding ?? null;
}