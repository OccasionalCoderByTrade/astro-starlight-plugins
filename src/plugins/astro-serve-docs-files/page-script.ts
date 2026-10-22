import { RAW_DOC_ALTERNATE_LINK_SELECTOR } from "./utils.js";

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

/**
 * The page's raw doc URL, from the raw doc alternate link `astroServeDocsFiles` adds to each
 * doc page whose raw doc is served (ADR 0012), or undefined when the page has none. Its
 * `href` already includes Astro's `base`.
 */
function findRawDocUrl(): string | undefined {
  const rawDocHref = document
    .querySelector<HTMLLinkElement>(RAW_DOC_ALTERNATE_LINK_SELECTOR)
    ?.getAttribute("href");
  if (!rawDocHref) return undefined;
  return new URL(rawDocHref, window.location.origin).toString();
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

function createActionBar(
  options: ActionBarOptions,
  rawDocUrl: string,
): HTMLDivElement {
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
          fetch(rawDocUrl)
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
          navigator.clipboard
            .writeText(rawDocUrl)
            .then(() => showBanner("Raw URL copied to clipboard!", "success"))
            .catch(() => showBanner("Failed to copy raw URL.", "error"));
        },
      },
      {
        label: "View raw",
        action: () => {
          window.open(rawDocUrl, "_blank");
        },
      },
    );
  }

  if (options.enableAskAiOption) {
    for (const { label, buildUrl } of LLM_ASK_TARGETS) {
      menuItems.push({
        label,
        action: () => {
          const prompt = `Read from ${rawDocUrl} so I can ask questions about it.`;
          window.open(buildUrl(prompt), "_blank");
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
  // No raw doc alternate link: not a doc page, or its raw doc isn't served
  const rawDocUrl = findRawDocUrl();
  if (rawDocUrl === undefined) return;
  const h1 = document.querySelector<HTMLHeadingElement>(".sl-container > h1");
  if (h1 === null) return;

  const wrapper = document.createElement("div");
  wrapper.className = "page-src-h1-wrapper";

  h1.replaceWith(wrapper);
  wrapper.appendChild(h1);
  wrapper.appendChild(createActionBar(options, rawDocUrl));
}
