/** Where a "Visit website" click came from, in words (see the `from` on each /go link). */
export const CLICK_SOURCES: Record<string, string> = {
  company: "Your listing",
  "company-offer": "Offers on your listing",
  "offers-page": "The offers page",
  "directory-search": "Directory search",
  "directory-top": "Directory home",
  category: "Your category's list",
  sponsored: "Sponsored spots",
  similar: "Similar companies",
};

export function clickSourceLabel(source: string | null) {
  return CLICK_SOURCES[(source ?? "").split(":")[0]] ?? "Other pages";
}
