import { buildLessonsV2QuestionPilots, type PilotSourceBindings } from '../src/lessons-v2/pilots';

function binding(value: string | undefined, name: string) {
  if (!value) throw new Error(`Provide ${name} as patternId:sourceChunkId:sourcePath.`);
  const [patternId, sourceChunkId, ...sourcePath] = value.split(':');
  if (!patternId || !sourceChunkId || !sourcePath.length) throw new Error(`Invalid ${name} binding.`);
  return { patternId, sourceChunkId, sourcePath: sourcePath.join(':') };
}

function main(): void {
  // Binding real reviewed pattern/chunk UUIDs is deliberate. It prevents this
  // script from inventing traceability or publishing drafts automatically.
  const values = Object.fromEntries(process.argv.slice(2).map((argument) => {
    const [key, value] = argument.replace(/^--/u, '').split('=', 2);
    return [key, value];
  }));
  const sources: PilotSourceBindings = {
    n5_reading: binding(values.n5_reading, 'n5_reading'), n5_vocabulary: binding(values.n5_vocabulary, 'n5_vocabulary'), n5_grammar: binding(values.n5_grammar, 'n5_grammar'), n5_order: binding(values.n5_order, 'n5_order'), n5_reading_passage: binding(values.n5_reading_passage, 'n5_reading_passage'),
    n4_usage: binding(values.n4_usage, 'n4_usage'), n4_grammar: binding(values.n4_grammar, 'n4_grammar'), n4_order: binding(values.n4_order, 'n4_order'), n4_reading: binding(values.n4_reading, 'n4_reading'), n4_information: binding(values.n4_information, 'n4_information'),
  };
  process.stdout.write(`${JSON.stringify(buildLessonsV2QuestionPilots(sources), null, 2)}\n`);
}

try { main(); } catch (error) { process.stderr.write(`Pilot draft generation failed: ${error instanceof Error ? error.message : 'Unknown error.'}\n`); process.exitCode = 1; }
