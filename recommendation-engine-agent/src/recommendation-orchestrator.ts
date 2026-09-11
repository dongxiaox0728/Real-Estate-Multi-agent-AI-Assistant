import { getListingsByIds } from "./get-listing-by-ID";
import { getCandidateListings } from "./get-candidate-listings";
import { getEmbeddingByListingId } from "./retrieve-saved-embedding";
import { calculateHybridScore } from "./hybrid-score";
import {
  validateWithComps,
  type CompValidationResult,
} from "./validate-with-comps";

import type { PropertyListing } from "./shared-types";

interface ScoredCandidate extends PropertyListing {
  similarityScore: number;
}

export interface RecommendationResult extends PropertyListing {
  similarityScore: number;
  compValidation: CompValidationResult | null;
}

export async function recommendListings(
  targetListingId: string,
  topK = 5
): Promise<RecommendationResult[]> {
  const cleanedTargetId = targetListingId.trim();

  if (!cleanedTargetId) {
    throw new Error("Target listing ID cannot be empty.");
  }

  if (!Number.isInteger(topK) || topK <= 0) {
    throw new Error("topK must be a positive integer.");
  }

  // 1. Get the property selected by the user.
  // getListingsByIds expects an array, so wrap the single target ID.
  const targetListings =
    await getListingsByIds([cleanedTargetId]);

  const targetListing =
    targetListings[0] ?? null;

  if (!targetListing) {
    throw new Error(
      `Target listing ${cleanedTargetId} was not found.`
    );
  }

  // 2. Get the target listing's saved embedding.
  const targetEmbedding =
    await getEmbeddingByListingId(cleanedTargetId);

  if (!targetEmbedding) {
    throw new Error(
      `No embedding was found for target listing ${cleanedTargetId}.`
    );
  }

  // 3. Get all other active listings.
  const candidates =
    await getCandidateListings(cleanedTargetId);


  // 4. Calculate the hybrid score for each candidate
  // that has a saved embedding.
  const scoredCandidates: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    const candidateEmbedding =
      await getEmbeddingByListingId(
        candidate.listingId
      );

    // During testing, only some listings may have embeddings.
    if (!candidateEmbedding) {
      continue;
    }

    const similarityScore =
      calculateHybridScore(
        targetListing,
        candidate,
        targetEmbedding,
        candidateEmbedding
      );

    scoredCandidates.push({
      ...candidate,
      similarityScore,
    });
  }


  // 5. Rank candidates and keep only the top recommendations.
  const topCandidates = scoredCandidates
    .sort(
      (a, b) =>
        b.similarityScore - a.similarityScore
    )
    .slice(0, topK);

  // 6. Validate each top recommendation using recent sold comps.
  const finalResults: RecommendationResult[] = [];

  for (const candidate of topCandidates) {
    let compValidation: CompValidationResult | null =
      null;

    const canValidateWithComps =
      candidate.city !== null &&
      candidate.city.trim() !== "" &&
      candidate.SquareFeet !== null &&
      candidate.SquareFeet > 0 &&
      candidate.price !== null &&
      candidate.price > 0;

    if (canValidateWithComps) {
      try {
        compValidation =
          await validateWithComps(
            candidate.city!,
            candidate.SquareFeet!,
            candidate.price!
          );
      } catch (error) {
        console.error(
          `Comp validation failed for listing ${candidate.listingId}:`
        );

        if (error instanceof Error) {
          console.error(error.message);
        } else {
          console.error(error);
        }
      }
    }

    finalResults.push({
      ...candidate,
      compValidation,
    });
  }

  return finalResults;
}
