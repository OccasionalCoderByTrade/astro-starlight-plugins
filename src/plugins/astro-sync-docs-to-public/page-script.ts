function showSuccessBanner(message: string): void {
  const banner = document.createElement("div");
  banner.className = "page-src-banner page-src-banner--success";
  banner.textContent = message;
  document.body.appendChild(banner);

  requestAnimationFrame(() => {
    banner.classList.add("page-src-banner--visible");
  });

  setTimeout(() => {
    banner.classList.remove("page-src-banner--visible");
    banner.addEventListener("transitionend", () => banner.remove(), {
      once: true,
    });
  }, 2500);
}

async function getRawMdUrl(): Promise<string> {
  const base = window.location.href.replace(/\/?$/, "/");
  const mdUrl = new URL("index.md", base).toString();
  const resp = await fetch(mdUrl, { method: "HEAD" });
  if (resp.ok) return mdUrl;
  return new URL("index.mdx", base).toString();
}

function createActionBar(): HTMLDivElement {
  const bar = document.createElement("div");
  bar.className = "page-src-action-bar";

  // --- dropdown trigger button ---
  const menuBtn = document.createElement("button");
  menuBtn.className = "page-src-action-bar__btn";
  menuBtn.textContent = "⋮";

  // --- dropdown menu ---
  const menu = document.createElement("div");
  menu.className = "page-src-action-bar__menu";

  const menuItems: { label: string; action: () => void }[] = [
    {
      label: "Copy Page",
      action: () => {
        getRawMdUrl()
          .then((url) => fetch(url))
          .then((resp) => resp.text())
          .then((text) => navigator.clipboard.writeText(text))
          .then(() => showSuccessBanner("Page source copied to clipboard!"));
      },
    },
    {
      label: "View raw",
      action: () => {
        getRawMdUrl().then((url) => window.open(url, "_blank"));
      },
    },
  ];

  for (const item of menuItems) {
    const btn = document.createElement("button");
    btn.className = "page-src-action-bar__menu-item";
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      item.action();
      closeMenu();
    });
    menu.appendChild(btn);
  }

  function openMenu() {
    menu.classList.add("page-src-action-bar__menu--open");
  }

  function closeMenu() {
    menu.classList.remove("page-src-action-bar__menu--open");
  }

  function isOpen() {
    return menu.classList.contains("page-src-action-bar__menu--open");
  }

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isOpen()) closeMenu();
    else openMenu();
  });

  document.addEventListener("click", () => {
    if (isOpen()) closeMenu();
  });

  bar.appendChild(menuBtn);
  bar.appendChild(menu);

  return bar;
}

function main() {
  const h1 = document.querySelector<HTMLHeadingElement>(".sl-container > h1");
  if (h1 === null) return;

  const wrapper = document.createElement("div");
  wrapper.className = "page-src-h1-wrapper";

  h1.replaceWith(wrapper);
  wrapper.appendChild(h1);
  wrapper.appendChild(createActionBar());
}

main();
