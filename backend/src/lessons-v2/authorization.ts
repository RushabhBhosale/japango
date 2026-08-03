export type LessonsV2AuthMode = 'disabled' | 'supabase';

export class LessonsV2AuthorizationError extends Error {
  constructor(public readonly code: 'AUTH_MODE_UNSUPPORTED' | 'AUTH_REQUIRED', message: string) {
    super(message);
  }
}

/** Route handlers depend on this boundary, never on the current development mode. */
export interface LessonsV2Authorization {
  assertManagementAccess(request: Request): Promise<void>;
}

class DisabledLessonsV2Authorization implements LessonsV2Authorization {
  async assertManagementAccess(_request: Request): Promise<void> {
    // Intentionally allow every request only for the explicitly documented
    // single-user local-development mode. No identity is created or stored.
  }
}

class FutureSupabaseLessonsV2Authorization implements LessonsV2Authorization {
  async assertManagementAccess(_request: Request): Promise<void> {
    throw new LessonsV2AuthorizationError(
      'AUTH_MODE_UNSUPPORTED',
      'Lessons V2 Supabase authorization is not configured. Use disabled mode only for local development.',
    );
  }
}

export function loadLessonsV2Authorization(): LessonsV2Authorization {
  const mode = (process.env.LESSONS_V2_AUTH_MODE ?? 'disabled') as LessonsV2AuthMode;
  if (mode === 'disabled') return new DisabledLessonsV2Authorization();
  if (mode === 'supabase') return new FutureSupabaseLessonsV2Authorization();
  throw new LessonsV2AuthorizationError('AUTH_MODE_UNSUPPORTED', 'LESSONS_V2_AUTH_MODE must be disabled or supabase.');
}
