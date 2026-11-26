/** Requests to booking sites asking them not to bid on the hostel's own name in search ads. Submitted by hand: they offer no API. */

export type TicketStatus = "draft" | "submitted" | "answered";

export const nextStatus = (s: TicketStatus): TicketStatus | null => (s === "draft" ? "submitted" : s === "submitted" ? "answered" : null);

export const STATUS_LABEL: Record<TicketStatus, string> = { draft: "Draft", submitted: "Submitted", answered: "Answered" };

/** Where to send the request. Guidance only: partner portals change, so check the current route in your extranet. */
export const OTA_SUPPORT_HINTS: Record<string, string> = {
  booking_com: "Send it through the Partner Hub: open Contact us or your account manager's message thread in the Booking.com extranet.",
  hostelworld: "Send it through the Hostelworld extranet messages, or to your Hostelworld account manager.",
  expedia: "Send it through Partner Central: Help, then Contact us, or your Expedia market manager.",
  airbnb: "Send it through Airbnb host support, or your partner contact if you have one.",
  agoda: "Send it through the YCS extranet help centre, or your Agoda account manager.",
  trip_com: "Send it through the Trip.com ebooking extranet support chat, or your account manager.",
  hotels_com: "Hotels.com is run through Expedia Partner Central. Use Help, then Contact us.",
  other: "Send it to the partner support contact or account manager for that booking site.",
};

/** A polite, specific request. Uses only the details it is given, and leaves out any line it has nothing for. */
export function draftBrandBiddingRequest(a: { otaName: string; hostelName: string; website: string | null; contactEmail: string }): { subject: string; body: string } {
  const lines = [
    "Hello,",
    "",
    `I manage ${a.hostelName}, a property listed on ${a.otaName}.`,
    `Please stop bidding on our brand name, "${a.hostelName}", and close variations of it, in paid search advertising that sends guests to ${a.otaName} instead of to us. Please also tell us whether this is already switched off for our property.`,
    "",
    "Guests searching for our name want to book with us. Competing for those searches raises our cost of getting a booking we would have received anyway, and we already pay commission on bookings made through your site.",
    "",
    "Please confirm in writing when this has been done, or tell us who to speak to about it.",
    "",
  ];
  const details = [a.website ? `Our website: ${a.website}` : "", a.contactEmail ? `Contact: ${a.contactEmail}` : ""].filter(Boolean);
  if (details.length) lines.push(...details, "");
  lines.push("Thank you,", a.hostelName);
  return { subject: `Request to stop bidding on our brand name: ${a.hostelName}`, body: lines.join("\n") };
}
