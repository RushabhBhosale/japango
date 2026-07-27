import { pathToFileURL } from "node:url";

export function isDirectExecution(importMetaUrl: string): boolean {
  return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === importMetaUrl;
}

export function runCli(task: () => Promise<void>): void {
  task().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

