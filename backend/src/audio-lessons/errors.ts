export class AudioLessonsError extends Error {
  constructor(
    public readonly code: 'CONFIGURATION_ERROR' | 'NOT_FOUND' | 'VALIDATION_FAILED' | 'CONFLICT' | 'DATABASE_ERROR',
    public readonly userMessage: string,
    public readonly status: number,
  ) {
    super(userMessage);
  }
}
