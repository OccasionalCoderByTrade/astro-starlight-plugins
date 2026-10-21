/**
  Lightweight React-like HTML construction via tagged template literals.
 
  ## Basic usage
 
  Interpolated values are automatically HTML-escaped (quotes included, so they
  are safe inside attributes too), preventing XSS:

  ```ts
  const title = '<script>alert(1)</script>';
  const elementStr = html`<h1>${title}</h1>`;
  console.log(elementStr.toString()); // <h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>
  ```
 
  ## Nesting `html` templates
 
  When an interpolated value is itself the output of an `html` template, it
  has already been escaped. Re-escaping it would corrupt the markup. Prefix
  the interpolation with an extra `$` to skip sanitization:
 
  ```ts
  const items = names.map(name => html`<li>${name}</li>`);
 
  const mylistStr = html`
    <ul>
      $${items}
    </ul>
  `;
  ```
 */

import { escapeUTF8 } from "entities";

export type TInterpolatedValue = string | HtmlString | number | boolean;

export class HtmlString extends String {}

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
      result += escapeUTF8(interpolatedVal);
    } else {
      result += literalVal.slice(0, -1);
      result += interpolatedVal;
    }
  });

  result += literalValues.slice(-1);
  return new HtmlString(result);
}
