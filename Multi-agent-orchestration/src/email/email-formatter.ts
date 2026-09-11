import type { AgentIntent } from "../intent-classifier";

export interface FormattedEmail {
  subject: string;
  body: string;
}

export function formatEmail(
  content: string,
  sourceIntent?: AgentIntent
): FormattedEmail {
  let subject = "IDX Exchange Real Estate Update";

  switch (sourceIntent) {
    case "property_search":
      subject = "Property Search Results";
      break;

    case "market_analysis":
      subject = "Real Estate Market Update";
      break;

    case "recommendation":
      subject = "Recommended Properties";
      break;

    case "knowledge":
      subject = "Real Estate Knowledge Explanation";
      break;
  }

  const body = [
    "Hi,",
    "",
    content.trim(),
    "",
    "Best,",
    "Dongxiao Xie",
  ].join("\n");

  return {
    subject,
    body,
  };
}