import type { CostLine } from "./costs";
import { costLineLabel } from "./costs";
import type { ProfitMetrics } from "./metrics";
import type { Finding, Severity } from "./types";

/**
 * The product is about what to DO, not just what the numbers say. Every
 * function here returns Finding objects with concrete steps. Estimates are
 * labelled and use the documented factors below.
 */

export const TARGET_OCCUPANCY = 0.7;
export const HIGH_OCCUPANCY = 0.92;
export const TARGET_RETURNING_SHARE = 0.2;
/** We assume a campaign captures half of the gap. Conservative, tune with data. */
export const CAPTURE_FACTOR = 0.5;
export const RETURNING_DISCOUNT = 0.1;
/** Raising returning-guest share by this many points is the modelled goal. */
export const RETURNING_LIFT = 0.05;

export type DataState = {
  hasBookings: boolean;
  hasBankData: boolean;
  missingCostLines: CostLine[];
  hasGuestIdentity: boolean;
  hasReviewSnapshot: boolean;
  hasPmsConnection: boolean;
};

const setup = (id: string, title: string, detail: string, severity: Severity, steps: string[]): Finding => ({
  id,
  kind: "setup",
  area: "setup",
  page: "setup",
  title,
  detail,
  monthlyImpactCents: 0,
  severity,
  steps,
});

/** Missing data blocks everything else, so these come first. */
export function setupActions(s: DataState): Finding[] {
  const out: Finding[] = [];
  if (!s.hasBookings) {
    out.push(
      setup(
        "setup-bookings",
        "Import your bookings to unlock profit insights",
        "Without bookings we cannot calculate occupancy, direct share or retention.",
        "high",
        [
          s.hasPmsConnection
            ? "Your PMS is connected. Run a sync from Connections."
            : "Connect Cloudbeds, Hostaway or Little Hotelier in Connections, once the API is switched on.",
          "Or export bookings as CSV from your PMS and upload them in Connections > Import files.",
          "Include check-in, check-out, source/channel, total, and guest email.",
        ],
      ),
    );
  }
  if (s.missingCostLines.length > 0) {
    const names = s.missingCostLines.map((l) => costLineLabel[l].toLowerCase()).join(", ");
    out.push(
      setup(
        "setup-costs",
        "Enter your monthly costs",
        `Missing: ${names}. Cost per bed needs all five lines.`,
        s.missingCostLines.length >= 3 ? "high" : "medium",
        [
          "Open Costs > Edit monthly costs.",
          "Enter rent, utilities, employee payroll, laundry and breakfast for this month.",
          "Update them each month. We track the change and show it in Reports.",
        ],
      ),
    );
  }
  if (!s.hasBankData) {
    out.push(
      setup(
        "setup-bank",
        "Upload a bank or card summary",
        "This lets us find duplicate charges, price rises and commission leaks.",
        "medium",
        [
          "Download the last 1-3 months as CSV from your bank or card portal.",
          "Upload it in Connections > Import files > Bank summary.",
          "We categorise the charges automatically. You can correct any we got wrong.",
        ],
      ),
    );
  }
  if (s.hasBookings && !s.hasGuestIdentity) {
    out.push(
      setup(
        "setup-guest-identity",
        "Add guest email to your booking export",
        "Retention needs to recognise returning guests.",
        "low",
        [
          "Re-export bookings from your PMS with the guest email column included.",
          "Upload again. Existing bookings are updated, not duplicated.",
        ],
      ),
    );
  }
  if (!s.hasReviewSnapshot) {
    out.push(
      setup(
        "setup-reviews",
        "Add your Google rating and review count",
        "We track changes in reviews and visibility month to month.",
        "low",
        [
          "Open Reports > Google reviews and visibility.",
          "Enter this month's rating, review count and search impressions.",
          "Do it once a month. A Google connection will automate it later.",
        ],
      ),
    );
  }
  return out;
}

export function profitActions(
  m: ProfitMetrics,
  beds: number,
): Finding[] {
  const out: Finding[] = [];
  const available = beds * m.days;

  if (m.bookingsCount > 0 && m.occupancyRate < TARGET_OCCUPANCY) {
    const emptyBeds = Math.round((TARGET_OCCUPANCY - m.occupancyRate) * available);
    const impact = Math.round(emptyBeds * m.adrCents * CAPTURE_FACTOR);
    out.push({
      id: "occupancy-low",
      kind: "growth",
      area: "growth",
      page: "profit",
      title: "Fill empty beds",
      detail: `${Math.round(m.occupancyRate * 100)}% occupancy vs ${Math.round(TARGET_OCCUPANCY * 100)}% target. Estimate assumes half the gap is filled.`,
      monthlyImpactCents: impact,
      severity: severityOf(impact),
      steps: [
        "Find your quietest nights in the PMS (usually Sunday to Wednesday).",
        "Add a midweek rate or a 3-night discount on those nights only.",
        "Offer group and long-stay rates to local schools, tours and remote workers.",
        "Check OTA photos and first-line description: refresh the weakest listing.",
      ],
    });
  }

  if (m.bookingsCount > 0 && m.occupancyRate > HIGH_OCCUPANCY) {
    const impact = Math.round(m.revenueCents * 0.05 * CAPTURE_FACTOR);
    out.push({
      id: "occupancy-high",
      kind: "growth",
      area: "growth",
      page: "profit",
      title: "Raise rates on your busiest nights",
      detail: `${Math.round(m.occupancyRate * 100)}% occupancy means demand exceeds supply. Estimate: +5% on half your nights.`,
      monthlyImpactCents: impact,
      severity: severityOf(impact),
      steps: [
        "Raise the rate 5% on every night that is more than 90% full.",
        "Keep a lower rate on shoulder nights to protect occupancy.",
        "Review after 2 weeks. If bookings hold, raise another 3%.",
      ],
    });
  }

  if (m.returningGuestShare !== null && m.returningGuestShare < TARGET_RETURNING_SHARE) {
    const extra = m.uniqueGuests * RETURNING_LIFT;
    const net = m.avgStayRevenueCents * (1 - RETURNING_DISCOUNT);
    const discountCost = m.returningGuests * m.avgStayRevenueCents * RETURNING_DISCOUNT;
    const impact = Math.round(extra * net - discountCost);
    if (impact > 0) {
      out.push({
        id: "retention-discount",
        kind: "growth",
        area: "growth",
        page: "profit",
        title: "Bring guests back with a returning-guest discount",
        detail: `${Math.round(m.returningGuestShare * 100)}% of guests are returning vs ${Math.round(TARGET_RETURNING_SHARE * 100)}% target. Modelled: ${Math.round(RETURNING_DISCOUNT * 100)}% discount lifts returning guests by ${Math.round(RETURNING_LIFT * 100)} points, net of the discount you give existing returners.`,
        monthlyImpactCents: impact,
        severity: severityOf(impact),
        steps: [
          "Create a direct-only code worth 10% for guests who stayed before.",
          "Email every past guest once a quarter with the code and your best dates.",
          "Send a win-back email 60 days after checkout to anyone who left a good review.",
          "Track redemptions. If the lift is under 3 points after a quarter, change the offer.",
        ],
      });
    }
  }

  return out;
}

/** Plan for the direct-booking and local SEO work. Static checklist, shown on Profit. */
export const DIRECT_BOOKING_PLAN: { title: string; steps: string[] }[] = [
  {
    title: "Own the Google listing",
    steps: [
      "Claim and verify your Google Business Profile.",
      "Add 20+ recent photos, services, and a direct booking link.",
      "Reply to every review within 48 hours.",
    ],
  },
  {
    title: "Make your site bookable",
    steps: [
      "Embed your PMS booking engine on the home page above the fold.",
      "Show your best rate and a 'book direct' perk next to it.",
      "Make sure the site loads in under 3 seconds on a phone.",
    ],
  },
  {
    title: "Rank for local searches",
    steps: [
      "Write one page per target search: 'hostel in [your area]', 'dorm bed near [landmark]'.",
      "Add page titles and descriptions that include the area and price from.",
      "Add structured data (LodgingBusiness) so Google shows rating and price.",
      "Get listed in local tourism directories and ask partners to link to you.",
    ],
  },
  {
    title: "Capture guests you already have",
    steps: [
      "Collect email at check-in with a clear reason: offers and returning-guest rates.",
      "Send a quarterly email with a direct-only code.",
    ],
  },
];

export function reviewActions(snapshot: { rating: number; reviewCount: number; prevRating?: number | null; prevReviewCount?: number | null } | null): Finding[] {
  if (!snapshot) return [];
  const out: Finding[] = [];
  if (snapshot.rating < 4.5) {
    out.push({
      id: "reviews-rating",
      kind: "growth",
      area: "growth",
      page: "reports",
      title: "Raise your Google rating above 4.5",
      detail: `Rated ${snapshot.rating.toFixed(1)}. Guests filter out anything under 4.5 on most booking sites.`,
      monthlyImpactCents: 0,
      severity: snapshot.rating < 4 ? "high" : "medium",
      steps: [
        "Read the last 10 low reviews and group them: cleanliness, noise, staff, value.",
        "Fix the top theme this week and reply publicly saying what changed.",
        "Ask every happy guest at checkout to leave a Google review. Add a QR code at reception.",
      ],
    });
  }
  const grewReviews = (snapshot.prevReviewCount ?? null) !== null ? snapshot.reviewCount - snapshot.prevReviewCount! : null;
  if (grewReviews !== null && grewReviews <= 0) {
    out.push({
      id: "reviews-flat",
      kind: "growth",
      area: "growth",
      page: "reports",
      title: "Get more reviews",
      detail: "No new Google reviews since last month. Fresh reviews lift local ranking.",
      monthlyImpactCents: 0,
      severity: "medium",
      steps: [
        "Send a review request email to guests the day after they leave.",
        "Put a QR code to your Google review page at reception and on key cards.",
        "Aim for 10 new reviews a month.",
      ],
    });
  }
  return out;
}

/** Setup first (they unlock everything), then highest dollar impact. */
export function rankActions(actions: Finding[]): Finding[] {
  const weight = (f: Finding) => (f.kind === "setup" ? (f.severity === "high" ? 2 : 0) : 1);
  return [...actions].sort((a, b) => {
    const w = weight(b) - weight(a);
    if (w !== 0) return w;
    return b.monthlyImpactCents - a.monthlyImpactCents;
  });
}

function severityOf(cents: number): Severity {
  if (cents >= 20_000) return "high";
  if (cents >= 7_500) return "medium";
  return "low";
}

