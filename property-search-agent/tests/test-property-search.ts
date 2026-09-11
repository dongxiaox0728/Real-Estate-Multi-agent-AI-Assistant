import { handleActiveListingConversation } from "../src/active-listing-orchestration";

async function main() {
  const userId = "test-user-1";

  const first = await handleActiveListingConversation({
    query: "Find me a house",
    userId,
  });

  console.log("\nFIRST RESPONSE:");
  console.log(first);

  const second = await handleActiveListingConversation({
    query: "Irvine",
    userId,
  });

  console.log("\nSECOND RESPONSE:");
  console.log(second);

  const third = await handleActiveListingConversation({
    query: "Under 1 million",
    userId,
  });

  console.log("\nTHIRD RESPONSE:");
  console.log(third);
}

main().catch(console.error);
