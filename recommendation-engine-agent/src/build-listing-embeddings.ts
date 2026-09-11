import fs from "node:fs/promises";
import path from "node:path";

import { getActiveListings } from "./get-raw-active-listings";
import { buildListingText } from "./convert-listing-text";
import { getEmbedding } from "./embedding-client";
import { pool } from "./mysql";

import type { ListingEmbedding } from "./shared-types";

const OUTPUT_FILE = path.resolve(
  process.cwd(),
  "data",
  "listing_embeddings.json"
);

// Number of database records fetched at a time.
const BATCH_SIZE = 100;

async function loadExistingEmbeddings(): Promise<ListingEmbedding[]> {
  try {
    const raw = await fs.readFile(OUTPUT_FILE, "utf8");
    const parsed = JSON.parse(raw) as ListingEmbedding[];

    if (!Array.isArray(parsed)) {
      throw new Error("Existing embedding file is not a JSON array.");
    }

    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function saveEmbeddings(results: ListingEmbedding[]): Promise<void> {
  await fs.mkdir(path.dirname(OUTPUT_FILE), {
    recursive: true,
  });

  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(results),
    "utf8"
  );
}

async function buildListingEmbeddings(): Promise<void> {
  const existingResults = await loadExistingEmbeddings();

  // Map prevents duplicate listing IDs if the script is restarted.
  const resultsById = new Map<string, ListingEmbedding>(
    existingResults.map((item) => [item.listingId, item])
  );

  console.log(
    `Found ${resultsById.size} existing embeddings. Starting batch processing...`
  );

  let offset = 0;
  let batchNumber = 1;
  let totalFetched = 0;
  let newlyEmbedded = 0;

  while (true) {
    const listings = await getActiveListings(BATCH_SIZE, offset);

    if (listings.length === 0) {
      break;
    }

    totalFetched += listings.length;

    console.log();
    console.log(
      `Batch ${batchNumber}: fetched ${listings.length} listings ` +
      `(offset ${offset}).`
    );

    for (let index = 0; index < listings.length; index += 1) {
      const listing = listings[index];

      // Makes the script resumable after an interruption.
      if (resultsById.has(listing.listingId)) {
        console.log(
          `[${index + 1}/${listings.length}] Skipping listing ` +
          `${listing.listingId}; embedding already exists.`
        );
        continue;
      }

      const listingText = buildListingText(listing);

      console.log(
        `[${index + 1}/${listings.length}] Embedding listing ${listing.listingId}`
      );

      try {
        const embedding = await getEmbedding(listingText);

        resultsById.set(listing.listingId, {
          listingId: listing.listingId,
          text: listingText,
          embedding,
        });

        newlyEmbedded += 1;
      } catch (error) {
        console.error(`Failed to embed listing ${listing.listingId}:`);

        if (error instanceof Error) {
          console.error(error.message);
        } else {
          console.error(error);
        }
      }
    }

    // Checkpoint after every database batch so progress is not lost.
    await saveEmbeddings(Array.from(resultsById.values()));

    console.log(
      `Checkpoint saved. Total stored embeddings: ${resultsById.size}.`
    );

    offset += listings.length;
    batchNumber += 1;
  }

  if (totalFetched === 0) {
    throw new Error("No active listings were returned from MySQL.");
  }

  console.log();
  console.log("Embedding generation complete.");
  console.log(`Database listings scanned: ${totalFetched}`);
  console.log(`New embeddings created: ${newlyEmbedded}`);
  console.log(`Total embeddings stored: ${resultsById.size}`);
  console.log(`Saved to: ${OUTPUT_FILE}`);
}

buildListingEmbeddings()
  .catch((error) => {
    console.error("Embedding generation failed:");

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
