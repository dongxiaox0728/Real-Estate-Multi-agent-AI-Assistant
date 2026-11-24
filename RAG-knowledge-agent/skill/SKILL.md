# RAG Knowledge Agent

## Purpose

This skill answers document-grounded real-estate knowledge questions.

Use this skill whenever the user's question is about:

- real-estate terminology or concepts
- DOM / Days on Market
- escrow
- comps / comparable sales
- list-to-close ratio
- cap rate
- MLS field definitions
- RESO field definitions
- `california_sold` columns or field meanings
- `rets_property` columns or field meanings
- IDX / RETS field mappings
- field names such as `ClosePrice`, `L_SystemPrice`, `L_Keyword2`, `LM_Dec_3`, `LM_Int2_3`, `L_City`, or `L_Address`

For these topics, do **not** answer from general model knowledge first. Use this RAG skill so the response is grounded in the indexed source documents.

## Routing / Skill Selection Guidance

Treat these as strong signals that this skill should be used:

- the user asks "What does DOM mean?" in a real-estate context
- the user asks what a real-estate abbreviation or market term means
- the user asks what an MLS / RESO / IDX / RETS field means
- the user asks which columns exist in `california_sold`
- the user asks which field corresponds to a real-estate concept
- the user asks for a definition that should come from the indexed documents

Examples that should route to this skill:

- "What does DOM mean?"
- "What is Days on Market?"
- "What is a list-to-close ratio?"
- "What does ClosePrice mean?"
- "What columns are in california_sold?"
- "What does L_SystemPrice represent?"
- "Which field stores city in rets_property?"

If an abbreviation is ambiguous in general English or software contexts, prefer the real-estate interpretation when the surrounding conversation is about real estate, MLS data, IDX, RETS, RESO, listings, sold properties, or housing-market analysis.

For example, in this skill's domain:

- `DOM` means **Days on Market**, not Document Object Model.

## Knowledge Sources

The RAG knowledge base currently contains:

1. **Real Estate Primer**
   - real-estate terminology and glossary-style definitions
   - examples: DOM, escrow, comps, list-to-close ratio

2. **Trestle Property Metadata**
   - RESO-standard property field names and definitions
   - useful for `california_sold` and other RESO-aligned fields

3. **IDX / RETS Property Schema Reference**
   - IDX-specific field mappings that may not appear in Trestle
   - useful for fields such as `L_SystemPrice`, `L_Keyword2`, `LM_Dec_3`, `LM_Int2_3`, `L_City`, and `L_Address`

Do not claim that a source contains information unless that information was actually retrieved from the indexed documents.

## RAG Pipeline

1. Load PDF documents and extract their text.
2. Chunk each document using the shared chunking function.
3. Create embeddings for every chunk.
4. Build an in-memory knowledge index containing source metadata, chunk text, and embeddings.
5. Create an embedding for the user's query.
6. Compare the query embedding with indexed chunk embeddings using cosine similarity.
7. Retrieve the highest-scoring chunks.
8. Generate an answer using only the retrieved context.

## Project Location

The RAG implementation lives at:

```text
C:\Users\xdx20\IDX-AI-Engineer\RAG-knowledge-agent
```

Do not assume `src/cli.ts` exists relative to the installed skill directory. Always run the RAG agent from the project directory above.

## Runtime / Execution

For a real-estate knowledge question, execute the RAG agent from the project directory:

```powershell
cd C:\Users\xdx20\IDX-AI-Engineer\RAG-knowledge-agent
npx tsx src/cli.ts "<USER_QUERY>"
```

Replace `<USER_QUERY>` with the user's exact question.

Example:

```powershell
cd C:\Users\xdx20\IDX-AI-Engineer\RAG-knowledge-agent
npx tsx src/cli.ts "What does DOM mean?"
```

The CLI should process one question, print the grounded answer, and exit.

If the current `cli.ts` is still interactive rather than one-shot, do not invent a different relative path. Use the same project directory and run the supported CLI behavior from there.

## Execution Behavior

When this skill is selected:

1. Use the RAG implementation in the project directory above rather than answering the knowledge question directly from model memory.
2. Pass the user's exact real-estate knowledge question into the RAG workflow.
3. Let the project handle document loading, chunking, indexing, retrieval, and grounded generation.
4. Return the grounded answer produced by the RAG workflow.
5. Preserve source names when they are available.
6. If execution fails, report the execution failure rather than silently answering from unsupported general knowledge.

If the RAG command cannot be executed, do not silently fall back to a generic answer.

## Main Components

- `src/convert-file-text.ts`
  - reads the configured PDF knowledge sources
  - extracts text
  - preserves each document's source/title metadata

- `src/chunk-text.ts`
  - splits extracted text into overlapping chunks

- `src/create_embedding.ts`
  - creates embeddings using the configured OpenAI embedding model
  - reused for both document chunks and user queries

- `src/build-index.ts`
  - converts document chunks into indexed chunks by attaching embeddings

- `src/cosine-similarity.ts`
  - computes cosine similarity between two embedding vectors

- `src/retrieval.ts`
  - embeds the user query
  - scores indexed chunks
  - sorts them by similarity
  - returns the top relevant chunks

- `src/generate-answer.ts`
  - sends the user question and retrieved context to the language model
  - instructs the model to answer only from retrieved evidence

- `src/final-orchestrator.ts`
  - connects document loading, chunking, indexing, retrieval, and answer generation

- `src/cli.ts`
  - provides the command-line entry point for the RAG agent

## Answering Rules

1. Use the RAG pipeline rather than answering directly from memory.
2. Base the answer only on retrieved document chunks.
3. Prefer the most relevant retrieved evidence.
4. Preserve source names so the response can identify where the information came from.
5. If the retrieved context does not contain enough information, say so clearly.
6. Do not invent MLS field definitions, mappings, legal rules, calculations, or terminology.
7. Do not silently substitute a similarly named field for the field the user asked about.
8. If sources conflict, mention the conflict instead of choosing one without explanation.
9. Do not reinterpret real-estate abbreviations as unrelated software terminology when the conversation is clearly about real estate.

## Expected Questions

- "What does DOM mean?"
- "What is a list-to-close ratio?"
- "What columns are in california_sold?"
- "What does ClosePrice mean?"
- "What does L_SystemPrice represent?"
- "Which field represents city in rets_property?"

## Out-of-Scope Requests

Do not use this skill as the main tool for:

- searching active listings
- finding sold comparables
- calculating live market statistics
- ranking properties
- modifying database records

Those tasks should be handled by the appropriate property-search or market-analysis workflow.

## Failure Behavior

If document loading, embedding, retrieval, generation, or CLI execution fails:

- do not fabricate an answer
- do not answer from unsupported general model knowledge
- surface a concise error
- identify the failed stage when possible
- preserve the original user question so it can be retried

If no retrieved chunks adequately support the answer, respond that the indexed knowledge sources do not contain enough information.

## Environment

The agent requires:

```env
OPENAI_API_KEY=...
```

Keep API keys in `.env` or another environment-variable mechanism. Never hard-code credentials in source files or expose them in user-facing output.

## Acceptance Check

Verify that OpenClaw can route and execute these questions through the RAG project:

1. `What does DOM mean?`
2. `What columns are in california_sold?`
3. `What is a list-to-close ratio?`

The final answer should come from the RAG workflow and be grounded in the indexed documents rather than unsupported model knowledge.
