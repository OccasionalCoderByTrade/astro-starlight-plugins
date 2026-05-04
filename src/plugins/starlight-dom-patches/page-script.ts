// Finds or creates a div.cannoli-actionable as the first child of starlight-toc
// and appends el to it. Returns false if starlight-toc is not present on this page.
function appendToActionPanel(element: HTMLElement): boolean {
  const starlightToc = document.querySelector<HTMLElement>("starlight-toc");
  if (!starlightToc) return false;

  let panel = starlightToc.querySelector<HTMLDivElement>(
    ":scope > div.cannoli-actionable",
  );

  if (!panel) {
    panel = document.createElement("div");
    panel.className = "cannoli-actionable";
    starlightToc.prepend(panel);
  }

  panel.appendChild(element);
  return true;
}

export function hideSingleLineGutters() {
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

type TabbedSection = {
  label: string;
  nodes: HTMLElement[];
  headingId?: string;
};

export function tabbedH2Content() {
  const LS_KEY = "starlight-dom-patches:tabbed-content";

  const contentContainer = document.querySelector<HTMLElement>(
    ".main-pane .sl-markdown-content",
  );
  if (!contentContainer) return;

  const starlightToc = document.querySelector<HTMLElement>("starlight-toc");
  if (!starlightToc) return;

  const contentChildren = Array.from(
    contentContainer.children,
  ) as HTMLElement[];
  if (contentChildren.length === 0) return;

  // Split content into sections at H2 boundaries.
  // Nodes before the first H2 become the optional "Main" section.
  function splitIntoSections(): {
    preH2Nodes: HTMLElement[];
    h2Sections: TabbedSection[];
  } {
    const isH2Wrapper = (element: HTMLElement) =>
      element.tagName === "DIV" &&
      element.classList.contains("sl-heading-wrapper") &&
      element.classList.contains("level-h2");

    const preH2Nodes: HTMLElement[] = [];
    const h2Sections: TabbedSection[] = [];
    let currentSection: TabbedSection | null = null;

    for (const block of contentChildren) {
      if (isH2Wrapper(block)) {
        if (currentSection) h2Sections.push(currentSection);
        const h2Element = block.querySelector("h2");
        currentSection = {
          label: h2Element ? headingInnerHTML(h2Element) : "",
          headingId: h2Element?.id,
          nodes: [block],
        };
      } else if (currentSection === null) {
        preH2Nodes.push(block);
      } else {
        currentSection.nodes.push(block);
      }
    }
    if (currentSection) h2Sections.push(currentSection);
    return { preH2Nodes, h2Sections };
  }

  const { preH2Nodes, h2Sections } = splitIntoSections();
  const hasPreH2Content = preH2Nodes.length > 0;
  if ((hasPreH2Content ? 1 : 0) + h2Sections.length <= 1) return;

  const allSections: TabbedSection[] = [];
  if (hasPreH2Content) allSections.push({ label: "Main", nodes: preH2Nodes });
  allSections.push(...h2Sections);

  // Build the tab wrapper, nav, and panels.
  // Moving nodes into panels detaches them from `markdownContent`.
  function buildTabs(): {
    tabbedWrapper: HTMLDivElement;
    tabNav: HTMLDivElement;
    tabButtons: HTMLButtonElement[];
    tabPanels: HTMLDivElement[];
  } {
    const tabbedWrapper = document.createElement("div");
    tabbedWrapper.className = "tabbed-content";

    const tabNav = document.createElement("div");
    tabNav.className = "tabbed-content-nav not-content";

    const tabButtons: HTMLButtonElement[] = [];
    const tabPanels: HTMLDivElement[] = [];

    allSections.forEach((section, sectionIndex) => {
      const tabButton = document.createElement("button");
      tabButton.className = "tabbed-content-tab";
      tabButton.innerHTML = section.label;
      tabButton.dataset.tab = String(sectionIndex);
      tabButtons.push(tabButton);
      tabNav.appendChild(tabButton);

      const tabPanel = document.createElement("div");
      tabPanel.className = "tabbed-content-panel";
      tabPanel.dataset.panel = String(sectionIndex);
      section.nodes.forEach((node) => tabPanel.appendChild(node));
      tabPanels.push(tabPanel);
    });

    tabbedWrapper.appendChild(tabNav);
    tabPanels.forEach((tabPanel) => tabbedWrapper.appendChild(tabPanel));
    return { tabbedWrapper, tabNav, tabButtons, tabPanels };
  }

  function buildPagination(): {
    paginationBar: HTMLDivElement;
    prevTabButton: HTMLButtonElement;
    nextTabButton: HTMLButtonElement;
  } {
    const paginationBar = document.createElement("div");
    paginationBar.className = "tabbed-content-pagination not-content";

    const prevTabButton = document.createElement("button");
    prevTabButton.className = "tabbed-content-pagination-btn";
    prevTabButton.dataset.direction = "prev";
    prevTabButton.textContent = "← Previous Tab";

    const nextTabButton = document.createElement("button");
    nextTabButton.className = "tabbed-content-pagination-btn";
    nextTabButton.dataset.direction = "next";
    nextTabButton.textContent = "Next Tab →";

    paginationBar.appendChild(prevTabButton);
    paginationBar.appendChild(nextTabButton);
    return { paginationBar, prevTabButton, nextTabButton };
  }

  function buildToggle(): HTMLInputElement {
    const viewToggleLabel = document.createElement("label");
    viewToggleLabel.className = "toggle-checkbox-btn";

    const viewToggleCheckbox = document.createElement("input");
    viewToggleCheckbox.type = "checkbox";

    const viewToggleText = document.createElement("span");
    viewToggleText.textContent = "Tabbed view";

    viewToggleLabel.appendChild(viewToggleCheckbox);
    viewToggleLabel.appendChild(viewToggleText);
    appendToActionPanel(viewToggleLabel);
    return viewToggleCheckbox;
  }

  const { tabbedWrapper, tabNav, tabButtons, tabPanels } = buildTabs();
  const { paginationBar, prevTabButton, nextTabButton } = buildPagination();

  // markdownContent is now empty (all children moved); append the new structure.
  contentContainer.appendChild(tabbedWrapper);
  contentContainer.appendChild(paginationBar);

  let activeTabIndex = 0;

  function isTabNavVisible(): boolean {
    const rect = tabNav.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  }

  function activateTab(
    targetIndex: number,
    updateHash = true,
    scrollToNav = false,
  ) {
    activeTabIndex = targetIndex;
    tabButtons.forEach((tabButton, buttonIndex) => {
      tabButton.dataset.active = String(buttonIndex === targetIndex);
    });
    tabPanels.forEach((tabPanel, panelIndex) => {
      tabPanel.hidden = panelIndex !== targetIndex;
    });
    prevTabButton.disabled = targetIndex === 0;
    nextTabButton.disabled = targetIndex === allSections.length - 1;
    const scrollBehavior = getComputedStyle(document.documentElement)
      .scrollBehavior as ScrollBehavior;
    tabButtons[targetIndex].scrollIntoView({
      behavior: scrollBehavior,
      block: "nearest",
      inline: "nearest",
    });
    if (scrollToNav) {
      tabNav.scrollIntoView({ behavior: scrollBehavior, block: "nearest" });
    }
    if (updateHash) {
      const targetHeadingId = allSections[targetIndex].headingId;
      if (targetHeadingId) {
        history.replaceState(null, "", `#${targetHeadingId}`);
      } else {
        history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    }
  }

  function findPanelIndexForHash(urlHash: string): number {
    const targetHeadingId = urlHash.startsWith("#")
      ? urlHash.slice(1)
      : urlHash;
    return tabPanels.findIndex((tabPanel) =>
      tabPanel.querySelector(`#${CSS.escape(targetHeadingId)}`),
    );
  }

  function setEnabled(enabled: boolean) {
    tabbedWrapper.dataset.enabled = String(enabled);
    tabNav.hidden = !enabled;
    paginationBar.hidden = !enabled;
    if (enabled) {
      const hashPanelIndex = window.location.hash
        ? findPanelIndexForHash(window.location.hash)
        : -1;
      activateTab(hashPanelIndex >= 0 ? hashPanelIndex : activeTabIndex, false);
    } else {
      tabPanels.forEach((tabPanel) => {
        tabPanel.hidden = false;
      });
    }
  }

  // When a TOC link is clicked while tabs are enabled, switch to the tab
  // that contains the target heading.
  function navigateToHash(urlHash: string) {
    if (!urlHash || tabbedWrapper.dataset.enabled !== "true") return;
    const targetPanelIndex = findPanelIndexForHash(urlHash);
    if (targetPanelIndex >= 0 && targetPanelIndex !== activeTabIndex)
      activateTab(targetPanelIndex, false);
  }

  function wireInteractions(viewToggleCheckbox: HTMLInputElement) {
    prevTabButton.addEventListener("click", () => {
      if (activeTabIndex > 0) {
        const scrollToNav = !isTabNavVisible();
        activateTab(activeTabIndex - 1, true, scrollToNav);
      }
    });
    nextTabButton.addEventListener("click", () => {
      if (activeTabIndex < allSections.length - 1) {
        const scrollToNav = !isTabNavVisible();
        activateTab(activeTabIndex + 1, true, scrollToNav);
      }
    });
    tabButtons.forEach((tabButton, buttonIndex) => {
      tabButton.addEventListener("click", () => {
        if (tabbedWrapper.dataset.enabled === "true") activateTab(buttonIndex);
      });
    });
    window.addEventListener("hashchange", () =>
      navigateToHash(window.location.hash),
    );
    viewToggleCheckbox.addEventListener("change", () => {
      setEnabled(viewToggleCheckbox.checked);
      localStorage.setItem(
        LS_KEY,
        viewToggleCheckbox.checked ? "enabled" : "disabled",
      );
    });
  }

  const viewToggleCheckbox = buildToggle();

  // Restore persisted state (default: disabled).
  const initialEnabled = localStorage.getItem(LS_KEY) === "enabled";
  viewToggleCheckbox.checked = initialEnabled;
  setEnabled(initialEnabled);
  if (window.location.hash) navigateToHash(window.location.hash);

  wireInteractions(viewToggleCheckbox);
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

export function limitDetailsElementHeight() {
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
