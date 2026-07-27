import { CONTENT_SCHEMA_VERSION } from "./config";
import { sha256Text } from "./lib/fs-utils";

export interface VersionedSource {
  id: string;
  checksum: string;
}

export function sourceFingerprint(
  sources: readonly VersionedSource[],
): string {
  return sha256Text(
    [...sources]
      .sort((left, right) => left.id.localeCompare(right.id, "en"))
      .map(({ id, checksum }) => `${id}:${checksum}`)
      .join("\n"),
  ).slice(0, 12);
}

export function contentVersionForSources(
  sources: readonly VersionedSource[],
): string {
  return `${CONTENT_SCHEMA_VERSION}+${sourceFingerprint(sources)}`;
}
