/** Starlight's sidebar badge variants. */
export type TSidebarBadgeVariant =
  "note" | "danger" | "success" | "caution" | "tip" | "default";

/** A sidebar badge, as Starlight's sidebar config takes it. */
export type TSidebarBadge = {
  text: string;
  variant: TSidebarBadgeVariant;
};

/** A sidebar entry that links to one page. */
export type TSidebarEntry = {
  label: string;
  slug: string;
  badge?: TSidebarBadge;
};

/** A sidebar group of entries and nested groups. */
export type TSidebarGroup = {
  label: string;
  items: TSidebarItem[];
  collapsed?: boolean;
};

/** One item of a Starlight sidebar, as both sidebar plugins build it. */
export type TSidebarItem = TSidebarEntry | TSidebarGroup;
