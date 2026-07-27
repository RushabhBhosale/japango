const XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

export function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

export function firstElementText(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "u"));
  return match ? decodeXml(match[1].replace(/<[^>]+>/gu, "")).trim() : null;
}

export function elementTexts(xml: string, tag: string): string[] {
  return Array.from(
    xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gu")),
    (match) => decodeXml(match[1].replace(/<[^>]+>/gu, "")).trim(),
  ).filter(Boolean);
}

export function elementValuesWithAttributes(
  xml: string,
  tag: string,
): Array<{ attributes: Record<string, string>; value: string }> {
  return Array.from(
    xml.matchAll(
      new RegExp(`<${tag}(?:\\s+([^>]*))?>([\\s\\S]*?)</${tag}>`, "gu"),
    ),
    (match) => {
      const attributes = Object.fromEntries(
        Array.from(
          (match[1] ?? "").matchAll(/([\w:-]+)="([^"]*)"/gu),
          (attribute) => [attribute[1], decodeXml(attribute[2])],
        ),
      );
      return {
        attributes,
        value: decodeXml(match[2].replace(/<[^>]+>/gu, "")).trim(),
      };
    },
  );
}

