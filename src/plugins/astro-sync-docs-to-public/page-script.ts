function showBanner(message: string, variant: "success" | "error"): void {
  const banner = document.createElement("div");
  banner.className = `page-src-banner page-src-banner--${variant}`;
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

  // Try index.{md,mdx} — covers pages backed by an index file
  for (const ext of [".md", ".mdx"]) {
    const url = new URL(`index${ext}`, base).toString();
    if ((await fetch(url, { method: "HEAD" })).ok) return url;
  }

  // Try ../segment.{md,mdx} — covers pages backed by a non-index file
  // e.g. page URL /reference/foo/ → file at /reference/foo.md
  const segment = new URL(base).pathname.replace(/\/$/, "").split("/").pop()!;
  const parentBase = new URL("../", base).toString();
  for (const ext of [".md", ".mdx"]) {
    const url = new URL(`${segment}${ext}`, parentBase).toString();
    if ((await fetch(url, { method: "HEAD" })).ok) return url;
  }

  return new URL("index.md", base).toString();
}

const LLM_ASK_TARGETS: {
  label: string;
  buildUrl: (prompt: string) => string;
}[] = [
  {
    label: "Ask ChatGPT",
    buildUrl: (prompt) =>
      `https://chatgpt.com/?${new URLSearchParams({ q: prompt })}`,
  },
  {
    label: "Ask Claude",
    buildUrl: (prompt) =>
      `https://claude.ai/new?${new URLSearchParams({ q: prompt })}`,
  },
  {
    label: "Ask Gemini",
    buildUrl: (prompt) =>
      `https://gemini.google.com/app?${new URLSearchParams({ q: prompt })}`,
  },
];

interface ActionBarOptions {
  exposePageSrcButton: boolean;
  enableAskAiOption: boolean;
}

function createActionBar(options: ActionBarOptions): HTMLDivElement {
  const bar = document.createElement("div");
  bar.className = "page-src-action-bar";

  // --- dropdown trigger button ---
  const menuBtn = document.createElement("button");
  menuBtn.className = "page-src-action-bar__btn";
  menuBtn.textContent = "⋮";

  function setLoading(loading: boolean) {
    menuBtn.classList.toggle("page-src-action-bar__btn--loading", loading);
  }

  // --- dropdown menu ---
  const menu = document.createElement("div");
  menu.className = "page-src-action-bar__menu";

  const menuItems: { label: string; action: () => void }[] = [];

  if (options.exposePageSrcButton) {
    menuItems.push(
      {
        label: "Copy Page",
        action: () => {
          setLoading(true);
          getRawMdUrl()
            .then((url) => fetch(url))
            .then((resp) => resp.text())
            .then((text) => navigator.clipboard.writeText(text))
            .then(() =>
              showBanner("Page source copied to clipboard!", "success"),
            )
            .catch(() => showBanner("Failed to copy page source.", "error"))
            .finally(() => setLoading(false));
        },
      },
      {
        label: "Copy raw URL",
        action: () => {
          setLoading(true);
          getRawMdUrl()
            .then((url) => navigator.clipboard.writeText(url))
            .then(() => showBanner("Raw URL copied to clipboard!", "success"))
            .catch(() => showBanner("Failed to copy raw URL.", "error"))
            .finally(() => setLoading(false));
        },
      },
      {
        label: "View raw",
        action: () => {
          setLoading(true);
          getRawMdUrl()
            .then((url) => window.open(url, "_blank"))
            .catch(() => showBanner("Failed to open raw source.", "error"))
            .finally(() => setLoading(false));
        },
      },
    );
  }

  if (options.enableAskAiOption) {
    for (const { label, buildUrl } of LLM_ASK_TARGETS) {
      menuItems.push({
        label,
        action: () => {
          setLoading(true);
          getRawMdUrl()
            .then((url) => {
              const prompt = `Read from ${url} so I can ask questions about it.`;
              window.open(buildUrl(prompt), "_blank");
            })
            .catch(() => showBanner(`Failed to open ${label}.`, "error"))
            .finally(() => setLoading(false));
        },
      });
    }
  }

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

  menuBtn.classList.add("page-src-action-bar__btn--glow");
  menuBtn.addEventListener(
    "animationend",
    () => menuBtn.classList.remove("page-src-action-bar__btn--glow"),
    { once: true },
  );

  return bar;
}

export function initPageActionBar(options: ActionBarOptions) {
  const h1 = document.querySelector<HTMLHeadingElement>(".sl-container > h1");
  if (h1 === null) return;

  const wrapper = document.createElement("div");
  wrapper.className = "page-src-h1-wrapper";

  h1.replaceWith(wrapper);
  wrapper.appendChild(h1);
  wrapper.appendChild(createActionBar(options));
}
