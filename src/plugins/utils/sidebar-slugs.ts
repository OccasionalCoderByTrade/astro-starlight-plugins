/** `slug` without a trailing `/index`, the form Starlight's sidebar expects. */
export function normalizeSidebarSlug(slug: string): string {
  return slug.endsWith("/index") ? slug.slice(0, -"/index".length) : slug;
}
