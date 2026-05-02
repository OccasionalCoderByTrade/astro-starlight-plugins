export type TBadgeVariant =
  | "note"
  | "danger"
  | "success"
  | "caution"
  | "tip"
  | "default";

export type TIndexMarker = {
  text: string;
  variant: TBadgeVariant;
};

export type TSidebar = TSidebarItem[];

export type TSidebarItem =
  | {
      label: string;
      slug: string;
      badge?: TIndexMarker;
    }
  | TGroupedItem;

export type TGroupedItem = {
  label: string;
  items: TSidebarItem[];
  collapsed?: boolean;
};
