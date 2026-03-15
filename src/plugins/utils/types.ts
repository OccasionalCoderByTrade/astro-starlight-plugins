export type TSidebar = TSidebarItem[];

export type TSidebarItem =
  | {
      label: string;
      slug: string;
    }
  | {
      label: string;
      items: TSidebarItem[];
    };
