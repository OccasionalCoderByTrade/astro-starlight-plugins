/** Hide line number code gutters that only contain a single line */
function hideSingleLineGutters() {
  const codeElements = document.querySelectorAll("div.expressive-code > figure > pre > code");

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

/** Wrap details content in a div.details-wrapper, keeping summary outside */
function wrapDetailsContent() {
  const detailsElements = document.querySelectorAll(".main-pane details");
  detailsElements.forEach((details) => {
    if (details.children.length === 0) return;

    const summary = details.querySelector(":scope > summary");

    if (!summary) {
      // No summary found, wrap all children
      const wrapper = document.createElement("div");
      wrapper.className = "details-wrapper";

      while (details.children.length > 0) {
        wrapper.appendChild(details.children[0]);
      }

      details.appendChild(wrapper);
    } else {
      // Summary exists, wrap everything except the summary
      const wrapper = document.createElement("div");
      wrapper.className = "details-wrapper";

      // Move all children except summary into wrapper
      const childrenToWrap = Array.from(details.children).filter((child) => child !== summary);

      childrenToWrap.forEach((child) => {
        wrapper.appendChild(child);
      });

      details.innerHTML = "";
      details.appendChild(summary);
      details.appendChild(wrapper);
    }
  });
}

(() => {
  hideSingleLineGutters();
  wrapDetailsContent();
})();
