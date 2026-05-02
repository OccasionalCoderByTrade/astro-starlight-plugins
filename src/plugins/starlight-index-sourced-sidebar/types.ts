export type TSidebar = TSidebarItem[];

export type TSidebarItem =
  | {
      label: string;
      slug: string;
    }
  | TGroupedItem;

export type TGroupedItem = {
  label: string;
  items: TSidebarItem[];
};
