// A tiny tagged template for server-rendered HTML. Interpolated values are
// escaped unless they are themselves `html` fragments (or arrays of them).

export class SafeHtml {
  value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function render(value: unknown): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === null || value === undefined || value === false) return "";
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  return new SafeHtml(strings.reduce((out, s, i) => out + render(values[i - 1]) + s));
}
