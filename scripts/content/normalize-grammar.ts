import { grammarBaseId, stableSlug } from "./lib/text-utils";

export function splitGrammarPattern(pattern: string): {
  pattern: string;
  alternates: string[];
} {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of pattern) {
    if (/[\[［(（【]/u.test(character)) depth += 1;
    if (/[\]］)）】]/u.test(character)) depth = Math.max(0, depth - 1);
    if (character === "・" && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return {
    pattern: parts[0] ?? pattern,
    alternates: parts.slice(1),
  };
}

export function grammarTitle(
  pattern: string,
  sourceLabel: string,
  occurrence: number,
): string {
  const label = sourceLabel.toLocaleLowerCase("en-US");
  if (pattern === "か") {
    return label.includes("or") ? "Alternative marker" : "Question marker";
  }
  if (pattern === "の") {
    if (label.includes("possession")) return "Possession marker";
    if (label.includes("nominal")) return "Nominalizer";
    return "Explanatory nominalizer";
  }
  if (pattern === "が") {
    return label.includes("subject") ? "Subject marker" : "Contrast conjunction";
  }
  if (pattern === "と") {
    if (label.includes("with")) return "Accompaniment marker";
    if (label.includes("quotation") || label.includes("quote")) return "Quotation marker";
    return occurrence === 0 ? "And marker" : `Particle sense ${occurrence + 1}`;
  }
  if (pattern === "で") {
    return label.includes("means") || label.includes("using")
      ? "Means marker"
      : "Action-location marker";
  }
  if (pattern === "から") {
    return label.includes("because") || label.includes("since")
      ? "Reason conjunction"
      : "Starting-point marker";
  }
  return `Pattern ${pattern}`;
}

export function grammarSemanticId(
  pattern: string,
  title: string,
  collision: boolean,
): string {
  const base = grammarBaseId(pattern);
  return collision ? `${base}-${stableSlug(title).slice(0, 40)}` : base;
}
