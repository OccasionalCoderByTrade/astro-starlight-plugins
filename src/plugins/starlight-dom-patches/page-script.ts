const TOC_NAV_SELECTOR = "nav[aria-labelledby='starlight__on-this-page']";

// Finds or creates a div.cannoli-actionable immediately before the TOC nav and
// appends el to it. Returns false if the TOC nav is not present on this page.
function appendToActionPanel(element: HTMLElement): boolean {
  const tocNav = document.querySelector<HTMLElement>(TOC_NAV_SELECTOR);
  if (!tocNav) return false;

  let panel =
    tocNav.parentElement?.querySelector<HTMLDivElement>(
      ":scope > div.cannoli-actionable",
    ) ?? null;

  if (!panel) {
    panel = document.createElement("div");
    panel.className = "cannoli-actionable";
    tocNav.parentNode!.insertBefore(panel, tocNav);
  }

  panel.appendChild(element);
  return true;
}

export function hideSingleLineGutters() {
  console.log("Hiding Single Line Gutters");

  const codeElements = document.querySelectorAll(
    "div.expressive-code > figure > pre > code",
  );

  codeElements.forEach((codeElement) => {
    const lineElements = codeElement.querySelectorAll("div.ec-line");

    if (lineElements.length === 1) {
      const gutter = lineElements[0].querySelector("div.gutter");
      if (gutter) {
        gutter.classList.add("visually-hidden");
      }
    }
  });
}

// Returns the heading's innerHTML, unwrapping a sole <strong> child if present.
function headingInnerHTML(heading: HTMLElement): string {
  if (
    heading.childElementCount === 1 &&
    heading.children[0].tagName === "STRONG"
  ) {
    return (heading.children[0] as HTMLElement).innerHTML;
  }
  return heading.innerHTML;
}

export function syncTocLabelsFromHeadings() {
  document
    .querySelectorAll("starlight-toc ul li > a, mobile-starlight-toc ul li > a")
    .forEach((anchor) => {
      const href = anchor.getAttribute("href") ?? "";
      const hashIndex = href.indexOf("#");
      if (hashIndex === -1) return;

      const id = href.slice(hashIndex + 1);
      if (id == "_top") return;

      const heading = document.getElementById(id);
      if (!heading) return;

      const span = anchor.querySelector(":scope > span");
      if (!span) return;

      span.innerHTML = headingInnerHTML(heading);
    });
}

export function tabbedH2Content() {
  console.log("[tabbedH2Content] running");
  const LS_KEY = "starlight-dom-patches:tabbed-content";

  const container = document.querySelector<HTMLElement>(
    ".main-pane .sl-markdown-content",
  );
  if (!container) {
    console.log(
      "[tabbedH2Content] no .main-pane .sl-markdown-content found — aborting",
    );
    return;
  }

  const children = Array.from(container.children) as HTMLElement[];
  if (children.length === 0) {
    console.log("[tabbedH2Content] content container is empty — aborting");
    return;
  }

  console.log(`[tabbedH2Content] container element:`, container);
  console.log(
    `[tabbedH2Content] found ${children.length} children:`,
    children.map((c) => c.tagName).join(", "),
  );

  // Split content into sections at H2 boundaries.
  // Nodes before the first H2 become the optional "Main" section.
  type Section = { label: string; nodes: HTMLElement[] };
  const preH2Nodes: HTMLElement[] = [];
  const h2Sections: Section[] = [];
  let currentSection: Section | null = null;

  const isH2Wrapper = (el: HTMLElement) =>
    el.tagName === "DIV" &&
    el.classList.contains("sl-heading-wrapper") &&
    el.classList.contains("level-h2");

  for (const child of children) {
    if (isH2Wrapper(child)) {
      if (currentSection) h2Sections.push(currentSection);
      const h2 = child.querySelector("h2");
      currentSection = {
        label: h2 ? headingInnerHTML(h2) : "",
        nodes: [child],
      };
    } else if (currentSection === null) {
      preH2Nodes.push(child);
    } else {
      currentSection.nodes.push(child);
    }
  }
  if (currentSection) h2Sections.push(currentSection);

  const hasPreContent = preH2Nodes.length > 0;
  const totalSections = (hasPreContent ? 1 : 0) + h2Sections.length;

  console.log(
    `[tabbedH2Content] preH2Nodes: ${preH2Nodes.length}, h2Sections: ${h2Sections.length}, totalSections: ${totalSections}`,
  );

  // Need at least two sections for tabs to be meaningful.
  if (totalSections <= 1) {
    console.log(
      "[tabbedH2Content] only one section — aborting (no tabs needed)",
    );
    return;
  }

  const allSections: Section[] = [];
  if (hasPreContent) allSections.push({ label: "Main", nodes: preH2Nodes });
  allSections.push(...h2Sections);

  // Build the tab wrapper, nav, and panels.
  // Moving nodes out of `container` first (appendChild detaches from old parent).
  const wrapper = document.createElement("div");
  wrapper.className = "tabbed-content";

  const nav = document.createElement("div");
  nav.className = "tabbed-content-nav not-content";

  const tabButtons: HTMLButtonElement[] = [];
  const panels: HTMLDivElement[] = [];

  allSections.forEach((section, i) => {
    const btn = document.createElement("button");
    btn.className = "tabbed-content-tab";
    btn.innerHTML = section.label;
    btn.dataset.tab = String(i);
    tabButtons.push(btn);
    nav.appendChild(btn);

    const panel = document.createElement("div");
    panel.className = "tabbed-content-panel";
    panel.dataset.panel = String(i);
    // Moving nodes into panel removes them from container.
    section.nodes.forEach((node) => panel.appendChild(node));
    panels.push(panel);
  });

  wrapper.appendChild(nav);
  panels.forEach((p) => wrapper.appendChild(p));
  // container is now empty (all children moved); append the new structure.
  container.appendChild(wrapper);

  let activeTab = 0;

  function activateTab(index: number) {
    activeTab = index;
    tabButtons.forEach((btn, i) => {
      btn.dataset.active = String(i === index);
    });
    panels.forEach((panel, i) => {
      panel.hidden = i !== index;
    });
  }

  function setEnabled(enabled: boolean) {
    wrapper.dataset.enabled = String(enabled);
    nav.hidden = !enabled;
    if (enabled) {
      activateTab(activeTab);
    } else {
      panels.forEach((panel) => {
        panel.hidden = false;
      });
    }
  }

  tabButtons.forEach((btn, i) => {
    btn.addEventListener("click", () => {
      if (wrapper.dataset.enabled === "true") activateTab(i);
    });
  });

  // When a TOC link is clicked while tabs are enabled, switch to the tab
  // that contains the target heading.
  function navigateToHash(hash: string) {
    if (!hash || wrapper.dataset.enabled !== "true") return;
    const id = hash.startsWith("#") ? hash.slice(1) : hash;
    panels.forEach((panel, i) => {
      if (panel.querySelector(`#${CSS.escape(id)}`)) activateTab(i);
    });
  }

  window.addEventListener("hashchange", () =>
    navigateToHash(window.location.hash),
  );
  if (window.location.hash) navigateToHash(window.location.hash);

  // Build and inject the toggle checkbox.
  const toggleLabel = document.createElement("label");
  toggleLabel.className = "toggle-checkbox-btn";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";

  const toggleText = document.createElement("span");
  toggleText.textContent = "Tabbed view";

  toggleLabel.appendChild(checkbox);
  toggleLabel.appendChild(toggleText);
  appendToActionPanel(toggleLabel);
  console.log(
    "[tabbedH2Content] toggle checkbox injected into .cannoli-actionable panel",
  );

  // Restore persisted state (default: disabled).
  const initialEnabled = localStorage.getItem(LS_KEY) === "enabled";
  console.log(
    `[tabbedH2Content] localStorage value: ${localStorage.getItem(LS_KEY)}, initialEnabled: ${initialEnabled}`,
  );
  checkbox.checked = initialEnabled;
  setEnabled(initialEnabled);

  checkbox.addEventListener("change", () => {
    setEnabled(checkbox.checked);
    localStorage.setItem(LS_KEY, checkbox.checked ? "enabled" : "disabled");
  });
}

export function toggleAllDetails() {
  const detailsElements = document.querySelectorAll(
    ".main-pane details:not(.visually-hidden)",
  );
  if (detailsElements.length === 0) return;

  const label = document.createElement("label");
  label.id = "toggle-all-details-btn";
  label.htmlFor = "toggle-all-details-checkbox";
  label.className = "toggle-checkbox-btn";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = "toggle-all-details-checkbox";
  checkbox.setAttribute("aria-label", "Toggle all details open/closed");

  const span = document.createElement("span");
  span.className = "toggle-label";
  span.textContent = "Expand All Dropdowns";

  label.appendChild(checkbox);
  label.appendChild(span);
  appendToActionPanel(label);

  let allOpen = false;

  checkbox.addEventListener("change", () => {
    document.body.dataset.bulkToggleActive = "true";

    detailsElements.forEach((details) => {
      (details as HTMLDetailsElement).open = !allOpen;
    });
    allOpen = !allOpen;

    setTimeout(() => {
      delete document.body.dataset.bulkToggleActive;
    }, 10);
  });
}

export function wrapDetailsContent() {
  console.log("Wrapping details element contents");

  const detailsElements = document.querySelectorAll(".main-pane details");
  detailsElements.forEach((details) => {
    if (details.children.length === 0) return;

    const summary = details.querySelector(":scope > summary");

    if (!summary) {
      const wrapper = document.createElement("div");
      wrapper.className = "details-wrapper";

      while (details.children.length > 0) {
        wrapper.appendChild(details.children[0]);
      }

      details.appendChild(wrapper);
    } else {
      const wrapper = document.createElement("div");
      wrapper.className = "details-wrapper";

      const childrenToWrap = Array.from(details.children).filter(
        (child) => child !== summary,
      );

      childrenToWrap.forEach((child) => {
        wrapper.appendChild(child);
      });

      details.innerHTML = "";
      details.appendChild(summary);
      details.appendChild(wrapper);
    }
  });
}
