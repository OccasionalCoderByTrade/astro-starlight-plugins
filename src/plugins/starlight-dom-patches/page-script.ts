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

      span.innerHTML = heading.innerHTML;
    });

  document
    .querySelectorAll("starlight-toc ul > li > a > span")
    .forEach((span) => {
      if (span.childElementCount !== 1) return;

      const child = span.children[0];
      if (child.tagName !== "STRONG") return;

      span.innerHTML = child.innerHTML;
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
