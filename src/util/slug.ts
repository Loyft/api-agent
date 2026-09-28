/** Convert a URL or name into a stable lowercase slug */
export function slugify(input: string, maxLength = 48): string {
  const cleaned = input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return cleaned || "site";
}

export function siteSlugFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return slugify(host);
  } catch {
    return slugify(url);
  }
}

export function routeSlugFromUrl(url: string, index: number): string {
  try {
    const u = new URL(url);
    const parts = u.pathname
      .split("/")
      .filter(Boolean)
      .filter((p) => !/^\d+$/.test(p) && !/^[0-9a-f-]{8,}$/i.test(p));
    const last = parts.slice(-2).join("-") || "data";
    const base = slugify(last, 40);
    return `${base || "data"}-${index + 1}`;
  } catch {
    return `endpoint-${index + 1}`;
  }
}
