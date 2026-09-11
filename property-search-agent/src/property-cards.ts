import type { ListingRow } from "./parse-structure";
import type { SoldCompRow } from "./search-sold-property";

// Property Card Types

export interface ActivePropertyCard {
  id: string;
  badge: "ACTIVE";

  price: string;
  address: string;
  location: string;
  specs: string;

  propertyType: string | null;
  yearBuilt: string | null;
  daysOnMarket: string | null;

  amenities: string[];

  agent: string | null;
  office: string | null;
}


export interface SoldPropertyCard {
  id: string;
  badge: "SOLD";

  soldPrice: string;
  closeDate: string | null;

  address: string;
  location: string;
  specs: string;

  propertyType: string | null;
  yearBuilt: string | null;

  listPrice: string | null;
  originalListPrice: string | null;
  daysOnMarket: string | null;

  agent: string | null;
  office: string | null;
}


// Format Helpers

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "Price unavailable";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}


function formatNumber(value: number | null): string {
  if (value === null) {
    return "N/A";
  }

  return value.toLocaleString("en-US");
}


function formatDate(
  value: Date | string | null
): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleDateString("en-US");
}


// Active Listing Cards

export function activeListingToCard(
  listing: ListingRow
): ActivePropertyCard {
  const agentName = [
    listing.agentFirstName,
    listing.agentLastName,
  ]
    .filter(Boolean)
    .join(" ");

  const amenities: string[] = [];

  if (listing.pool) {
    amenities.push("Pool");
  }

  if (listing.hasView) {
    amenities.push("View");
  }

  return {
    id: String(listing.id),

    badge: "ACTIVE",

    price: formatCurrency(listing.price),

    address:
      listing.address ?? "Address unavailable",

    location: [
      listing.city,
      listing.zip,
    ]
      .filter(Boolean)
      .join(", "),

    specs:
      `${listing.beds ?? "N/A"} bd · ` +
      `${listing.baths ?? "N/A"} ba · ` +
      `${formatNumber(listing.sqft)} sqft`,

    propertyType:
      listing.propertyType ?? null,

    yearBuilt:
      listing.yearBuilt !== null
        ? `Built ${listing.yearBuilt}`
        : null,

    daysOnMarket:
      listing.daysOnMarket !== null
        ? `${listing.daysOnMarket} days on market`
        : null,

    amenities,

    agent:
      agentName || null,

    office:
      listing.officeName ?? null,
  };
}


// Sold Property Card

export function soldCompToCard(
  property: SoldCompRow
): SoldPropertyCard {
  return {
    id: String(property.id),

    badge: "SOLD",

    soldPrice:
      formatCurrency(property.closePrice),

    closeDate:
      formatDate(property.closeDate),

    address:
      property.address ?? "Address unavailable",

    location:
      property.city ?? "",

    specs:
      `${property.beds ?? "N/A"} bd · ` +
      `${property.baths ?? "N/A"} ba · ` +
      `${formatNumber(property.sqft)} sqft`,

    propertyType:
      property.propertySubtype ??
      property.propertyType ??
      null,

    yearBuilt:
      property.yearBuilt !== null
        ? `Built ${property.yearBuilt}`
        : null,

    listPrice:
      property.listPrice !== null
        ? formatCurrency(property.listPrice)
        : null,

    originalListPrice:
      property.originalListPrice !== null
        ? formatCurrency(property.originalListPrice)
        : null,

    daysOnMarket:
      property.daysOnMarket !== null
        ? `${property.daysOnMarket} days on market`
        : null,

    agent:
      property.listAgentName ?? null,

    office:
      property.listOfficeName ?? null,
  };
}


// Active Listing Display

export function formatActiveListings(
  listings: ListingRow[]
): string {
  if (listings.length === 0) {
    return "I could not find any active listings matching those filters.";
  }

  const cards = listings.map((listing, index) => {
    const agentName = [
      listing.agentFirstName,
      listing.agentLastName,
    ]
      .filter(Boolean)
      .join(" ");

    const features: string[] = [];

    if (listing.hasView) {
      features.push("View");
    }

    if (listing.pool) {
      features.push("Pool");
    }

    return [
      `🏠 *${index + 1}. ${listing.address ?? "Address unavailable"}*`,
      `📍 ${listing.city ?? ""}${listing.zip ? `, ${listing.zip}` : ""}`,
      `💰 *${formatCurrency(listing.price)}*`,
      `🛏 ${listing.beds ?? "N/A"} beds · 🛁 ${listing.baths ?? "N/A"} baths · 📐 ${formatNumber(listing.sqft)} sqft`,
      listing.propertyType || listing.yearBuilt
        ? `🏘️ ${listing.propertyType ?? "Property"}${listing.yearBuilt ? ` · 🏗️ Built ${listing.yearBuilt}` : ""}`
        : "",
      listing.daysOnMarket !== null &&
      listing.daysOnMarket !== undefined
        ? `📅 ${listing.daysOnMarket} days on market`
        : "",
      features.length > 0
        ? `✨ ${features.join(" · ")}`
        : "",
      agentName
        ? `👤 Listed by ${agentName}`
        : "",
      listing.officeName
        ? `🏢 ${listing.officeName}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    `I found ${listings.length} matching homes:`,
    "",
    cards.join("\n\n"),
  ].join("\n");
}

// Sold Property Display

export function formatSoldComps(
  properties: SoldCompRow[]
): string {
  if (properties.length === 0) {
    return "I could not find any recently sold properties matching that request.";
  }

  const cards = properties.map(
    (property, index) => {
      const card =
        soldCompToCard(property);

      return [
        `[${card.badge}]${
          card.closeDate
            ? ` · ${card.closeDate}`
            : ""
        }`,
        `${index + 1}. ${card.soldPrice}`,
        card.specs,
        "",
        card.address,
        card.location,
        "",
        [
          card.propertyType,
          card.yearBuilt,
        ]
          .filter(Boolean)
          .join(" · "),
        card.listPrice
          ? `List price: ${card.listPrice}`
          : "",
        card.originalListPrice
          ? `Original list price: ${card.originalListPrice}`
          : "",
        card.daysOnMarket,
        card.agent
          ? `Listed by ${card.agent}`
          : "",
        card.office
          ? `Office: ${card.office}`
          : "",
      ]
        .filter((line) => line !== null && line !== "")
        .join("\n");
    }
  );

  return [
    `I found ${properties.length} recently sold properties:`,
    "",
    cards.join("\n\n"),
  ].join("\n");
}