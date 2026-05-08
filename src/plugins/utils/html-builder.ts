/**
  Lightweight React-like HTML construction via tagged template literals.
 
  ## Basic usage
 
  Interpolated values are automatically HTML-escaped, preventing XSS:
 
  ```ts
  const title = '<script>alert(1)</script>';
  const elementStr = html`<h1>${title}</h1>`;
  const element = elementStr.asElement();
  console.log(elementStr.toString()); // <h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>
  ```
 
  ## Nesting `html` templates
 
  When an interpolated value is itself the output of an `html` template, it
  has already been escaped. Re-escaping it would corrupt the markup. Prefix
  the interpolation with an extra `$` to skip sanitization:
 
  ```ts
  const items = names.map(name => html`<li>${name}</li>`);
 
  const mylistElement = html`
    <ul>
      $${items}
    </ul>
  `.asElement();
  ```
 */

import { JSDOM } from "jsdom";

const { document } = new JSDOM("").window;

export type TInterpolatedValue = string | HtmlString | number | boolean;

const HtmlSanitizer = {
  tempElement: document.createElement("div"),
  sanitize(htmlString: string): string {
    this.tempElement.textContent = htmlString;
    return this.tempElement.innerHTML;
  },
};

export class HtmlString extends String {
  element: Element | null = null;

  constructor(value: string) {
    super(value);
  }

  asElement(): Element {
    if (this.element !== null) {
      return this.element;
    }

    const temp = document.createElement("div");
    temp.innerHTML = this.valueOf();

    if (temp.childElementCount > 1) {
      throw new Error("html template does not accept more than 1 element");
    }

    const child = temp.firstElementChild;
    if (child === null) {
      throw new Error("html template produced no elements");
    }

    this.element = child;
    return this.element;
  }
}

export function html(
  literalValues: TemplateStringsArray,
  ...interpolatedValues: (TInterpolatedValue | TInterpolatedValue[])[]
): HtmlString {
  let result = "";

  interpolatedValues.forEach((currentInterpolatedVal, idx) => {
    const literalVal = literalValues[idx];
    let interpolatedVal = "";
    if (Array.isArray(currentInterpolatedVal)) {
      interpolatedVal = currentInterpolatedVal.join("\n");
    } else if (typeof currentInterpolatedVal !== "boolean") {
      interpolatedVal = currentInterpolatedVal.toString();
    }

    const isSanitize = !literalVal.endsWith("$");
    if (isSanitize) {
      result += literalVal;
      result += HtmlSanitizer.sanitize(interpolatedVal);
    } else {
      result += literalVal.slice(0, -1);
      result += interpolatedVal;
    }
  });

  result += literalValues.slice(-1);
  return new HtmlString(result);
}
