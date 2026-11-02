/** Public product page. */
export function productPath(username: string, slug: string) {
  return `/@${username}/${slug}`;
}

/** The members area of a product: community, course player, downloads and so on. */
export function insidePath(username: string, slug: string, rest = "") {
  return `/@${username}/${slug}/inside${rest}`;
}

/** The creator's own share link: counts the visitor as their audience (0% fee). */
export function shareLink(username: string, to?: string) {
  return to ? `/r/${username}?to=${encodeURIComponent(to)}` : `/r/${username}`;
}
