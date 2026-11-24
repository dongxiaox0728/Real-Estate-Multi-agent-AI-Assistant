# California Market Analytics

This skill is designed when a user wants aggregated or historical California housing market analysis for a city.

This skill only analyzes sold-market data from `california_sold`. It does not search active listings.

Use the `property-search-agent` skill when the user wants to find active homes with filters such as city, price, property type, bedrooms, bathrooms, square footage, HOA, pool, or view.

## Inputs

- `query`: The user's current market-analysis question.

## Behavior

1. Pass the user's complete market-analysis question into the local TypeScript market-analysis workflow.
2. Load supported city names from `california_sold` through `marketCities.ts`.
3. Parse the question through `parseMarketQuery.ts`.
4. Route the parsed request through `question-type-router.ts`.
5. Execute exactly one of the four supported analytics paths:
   - market summary
   - specific market metric
   - market trend
   - market condition
6. Format the structured analytics result through `marketResponseFormatter.ts`.
7. Return the response produced by the TypeScript workflow as the user-facing response.
8. Do not independently calculate market values from this document.
9. Do not replace the workflow result with web data, model knowledge, Zillow, Redfin, Realtor.com, or another external market source.
10. If command execution fails, report the execution failure instead of fabricating a market-analysis answer.
11. If the parser cannot identify a supported city or question type, return that workflow error rather than inventing an interpretation.

## Supported Question Types

### 1. Market summary

Use for broad questions such as:

- How is the Irvine housing market?
- Give me a market overview for Pasadena.
- How is the overall market doing in San Diego?

The market summary returns:

- total sales count
- average close price
- median close price
- average days on market
- average list-to-close price ratio
- average price per square foot

Default period: 12 months.

### 2. Specific market metric

Use when the user asks for one statistic.

Supported metrics:

- `avg_close_price`
- `median_close_price`
- `avg_dom`
- `list_to_close_ratio`
- `price_per_sqft`
- `sales_count`

Examples:

- What is the average home price in Pasadena?
- What is the median close price in Irvine?
- What is the average DOM in Sacramento?
- How many homes sold in Los Angeles?
- What is the average price per square foot in San Diego?

Use the user's requested month range when provided. Otherwise use 12 months.

### 3. Market trend

Use when the user asks whether a market metric has changed over time.

Supported trend metrics:

- `close_price`
- `avg_dom`
- `price_per_sqft`
- `sales_count`
- `list_to_original_price_ratio`

Examples:

- Is the close price in Irvine increasing?
- Are homes taking longer to sell in Irvine?
- Is price per square foot rising in San Diego?
- Is Sacramento sales volume decreasing?
- Is the list-to-original-price ratio changing?

The trend workflow:

1. groups the selected metric by month
2. returns the monthly values
3. calculates a linear-regression slope using month index as `x`
4. returns the slope with the correct unit

Slope units:

- close price -> dollars per month
- average DOM -> days per month
- price per square foot -> dollars per square foot per month
- sales count -> sales per month
- list-to-original-price ratio -> unitless

Do not independently invent an `increasing`, `decreasing`, or `stable` classification. Return the formatted result produced by the workflow.

### 4. Market condition

The market-condition path supports three subtypes.

#### Buyer vs. seller market

Condition value:

- `buyer_seller_market`

Use average days on market.

Rules:

- average DOM < 30 -> seller's market
- average DOM from 30 through 60 -> balanced market
- average DOM > 60 -> buyer's market
- missing DOM -> insufficient data

Examples:

- Is Irvine a buyer's market?
- Is San Diego a seller's market?
- Is Pasadena balanced?

#### Competitiveness

Condition value:

- `competitiveness`

Use:

```text
ClosePrice / OriginalListPrice
```

Rules:

- ratio > 1 -> competitive
- ratio <= 1 -> not competitive
- missing ratio -> insufficient data

Examples:

- Is Irvine competitive?
- Are homes selling above their original asking price in Pasadena?

#### Good time to buy

Condition value:

- `good_time_to_buy`

This condition always uses the most recent 3 months.

It calculates regression slopes for:

1. `close_price`
2. `avg_dom`
3. `price_per_sqft`
4. `list_to_original_price_ratio`
5. `sales_count`

Buyer-favorable signals:

- close-price slope < 0
- average-DOM slope > 0
- price-per-square-foot slope < 0
- list-to-original-price-ratio slope < 0
- sales-count slope < 0

Score the number of buyer-favorable indicators:

- 5 -> wonderful
- 4 -> good
- 3 -> somewhat good
- 2 -> not so great
- 0 or 1 -> worst

Return the score, rating, and indicator evidence produced by the workflow.

This is a market-condition heuristic, not personalized financial advice.

## Query Parsing

`parseMarketQuery.ts` converts the user's natural-language question into a structured request.

It determines:

- question type
- supported city
- requested market metric or trend metric
- requested market-condition subtype
- requested month range
- property type

Defaults:

- `propertyType = "Residential"`
- `months = 12`

Exception:

- `good_time_to_buy` always uses 3 months

Do not parse the question independently in the skill when the TypeScript workflow is available.

## City Handling

Supported cities are loaded by `marketCities.ts` from distinct `City` values in `california_sold`.

The parser matches the user's question against those supported cities.

If no supported city is found, return the workflow error or ask the user to provide a supported California city.

Do not invent or substitute a city.

## Execution Flow

The implementation follows this sequence:

1. `answerMarketQuestion.ts`
2. `marketCities.ts`
3. `parseMarketQuery.ts`
4. `question-type-router.ts`
5. one of:
   - `market-summary.ts`
   - `marketMetric.ts`
   - `market-trend.ts`
   - `market-condition.ts`
6. `marketResponseFormatter.ts`

The local CLI entrypoint is `src/cli.ts`.

`answerMarketQuestion.ts` is the top-level market-question function.

## OpenClaw Execution Rules

For every supported market-analysis request, OpenClaw must use the TypeScript market-analysis workflow instead of answering the market question itself.

- Execute the local market-analysis agent through `src/cli.ts` from the actual `market-analysis-agent` project directory.
- Pass the user's complete current message into the workflow.
- Treat the response produced by `answerMarketQuestion` and `marketResponseFormatter` as the source of truth.
- Return that response to the user without replacing it with a separately generated market analysis.
- Do not search the web for Zillow, Redfin, Realtor.com, or other public market trackers when this skill applies.
- Do not use model knowledge as a substitute for the local `california_sold` result.
- Do not manually reproduce the formulas in this file when the TypeScript implementation can execute them.
- If the workflow returns a parser or unsupported-city error, return that error or ask only for the missing supported city.
- If command execution fails, report the execution failure instead of fabricating market values from the instructions in this file.

The intended behavior is:

```text
User: How is the Irvine housing market?
Agent: [response produced by the local market-summary workflow]

User: What is the average DOM in Irvine over the last 6 months?
Agent: [response produced by the local market-metric workflow]

User: Is the close price in Irvine increasing?
Agent: [monthly values and regression slope produced by the local market-trend workflow]

User: Is Irvine a buyer's market?
Agent: [DOM-based classification produced by the local market-condition workflow]

User: Is now a good time to buy in Irvine?
Agent: [3-month 5-indicator score produced by the local market-condition workflow]
```

## Database Access

Use the shared database helper in `mysql.ts`.

The MySQL connection pool is private.

Use the exported helpers:

- `query()`
- `testConnection()`
- `closeDatabase()`

Do not import `pool` directly into other files.

The analytics source of truth is:

```text
california_sold
```

Core fields include:

- `City`
- `PropertyType`
- `CloseDate`
- `ClosePrice`
- `ListPrice`
- `OriginalListPrice`
- `LivingArea`
- `DaysOnMarket`

## Response Behavior

Return the formatted response from `marketResponseFormatter.ts`.

Do not independently rewrite the numerical conclusions.

Formatting conventions used by the workflow include:

- prices as U.S. dollars
- DOM as days
- price per square foot as dollars per square foot
- sales count as an integer
- list-to-close ratio as a percentage
- list-to-original-price ratio as a raw ratio
- regression slopes with their corresponding units

If data are missing or insufficient, say so rather than inventing a value.

## Distinguishing This Skill From Active Listing Search

Use this market-analysis skill for:

- average sold price
- median sold price
- sales count
- days on market
- price per square foot
- list-to-close ratio
- historical market trends
- regression slopes
- buyer-versus-seller market conditions
- market competitiveness
- good-time-to-buy market-condition scoring

Use the `active-listing-agent` skill for:

- Find homes in Irvine under $1.2M.
- Show me three-bedroom condos.
- Find listings with a pool.
- Find active homes with HOA under $500.
- Search active listings in a ZIP code.

Do not use the market-analysis skill to return individual active listings.

## Local Testing

From the `market-analysis-agent` directory, run:

```bash
npm run cli
```

or:

```bash
npx tsx src/cli.ts
```

Example questions:

```text
How is the Irvine housing market?
What is the average DOM in Irvine over the last 6 months?
Is the close price in Irvine increasing?
Is Irvine a buyer's market?
Is the Irvine market competitive?
Is now a good time to buy in Irvine?
```

## Limitation

This skill depends on the local `market-analysis-agent` project, its TypeScript dependencies, MySQL configuration, and access to `california_sold`.

If the project directory, TypeScript runtime, environment variables, or MySQL connection are unavailable to OpenClaw, report that execution failure. Do not silently replace the local analytics with public web-market data.
