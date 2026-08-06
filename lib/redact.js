// PII detection and masking, applied before any text leaves the browser when
// privacy mode is on. Pure and unit tested. Patterns are deliberately
// conservative: a missed identifier is safer than mangling ordinary numbers.

const PATTERNS = [
  // Email addresses.
  { name: "email", regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // Indian PAN: five letters, four digits, one letter.
  { name: "pan", regex: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g },
  // Aadhaar: four-four-four digits with spaces or dashes. Requiring separators
  // avoids swallowing arbitrary 12-digit numbers.
  { name: "aadhaar", regex: /\b\d{4}[- ]\d{4}[- ]\d{4}\b/g },
  // Payment card: four groups of four digits with separators.
  { name: "card", regex: /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/g },
  // Phone: optional +country code then a 10-digit run, allowing separators.
  {
    name: "phone",
    regex: /(?:\+\d{1,3}[- ]?)?(?:\d[- ]?){9}\d\b/g,
  },
];

// Replace each identifier with a typed placeholder and count substitutions.
// Card runs before Aadhaar-shaped matches inside it can fire; the pattern
// order above is longest-match-first for the digit groups.
export function redact(text) {
  let out = text || "";
  let count = 0;
  // Apply card before aadhaar before phone so longer digit patterns win.
  const order = ["email", "pan", "card", "aadhaar", "phone"];
  for (const name of order) {
    const { regex } = PATTERNS.find((p) => p.name === name);
    out = out.replace(regex, () => {
      count += 1;
      return `[${name.toUpperCase()} REDACTED]`;
    });
  }
  return { text: out, count };
}
