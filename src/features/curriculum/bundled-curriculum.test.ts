import { describe, expect, it } from 'vitest';

import { bundledCurriculumMetadata, loadBundledCurriculum } from './bundled-curriculum';

describe('bundled mobile curriculum', () => {
  it('loads the packaged release through the mobile boundary schema', () => {
    const bundle = loadBundledCurriculum();

    expect(bundle.contentVersion).toBe(bundledCurriculumMetadata.contentVersion);
    expect(bundle.items.filter((item) => item.type === 'vocabulary')).toHaveLength(1740);
    expect(bundle.vocabularyQuestions).toHaveLength(10440);
    expect(bundle.items.every((item) => {
      if (item.type === 'reading' || item.type === 'listening') return true;
      return item.confidence >= 0 && item.confidence <= 1 && item.needsReview === false;
    })).toBe(true);
  });
});
