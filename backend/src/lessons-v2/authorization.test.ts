import { describe, expect, it } from 'vitest';

import { loadLessonsV2Authorization } from './authorization';

describe('Lessons V2 authorization boundary', () => {
  it('allows local management requests when auth is disabled', async () => {
    const previous = process.env.LESSONS_V2_AUTH_MODE;
    process.env.LESSONS_V2_AUTH_MODE = 'disabled';
    await expect(loadLessonsV2Authorization().assertManagementAccess(new Request('http://localhost/admin'))).resolves.toBeUndefined();
    process.env.LESSONS_V2_AUTH_MODE = previous;
  });
});
