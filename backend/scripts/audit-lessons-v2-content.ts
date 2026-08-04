import { LessonsV2Service } from '../src/lessons-v2/service';

async function main(): Promise<void> {
  const audit = await new LessonsV2Service().auditContent();
  process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
  if (audit.issues.some((issue) => issue.severity === 'critical')) process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stderr.write(`Lessons V2 content audit failed: ${error instanceof Error ? error.message : 'Unknown error.'}\n`);
  process.exitCode = 1;
});
