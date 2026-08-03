export class JapaneseRetrievalError extends Error {
  constructor(
    public readonly code:
      | 'CONFIGURATION_ERROR'
      | 'EMBEDDING_FAILED'
      | 'INVALID_EMBEDDING'
      | 'DATABASE_ERROR'
      | 'INVALID_DATABASE_RESPONSE',
    public readonly retryable: boolean,
    public readonly userMessage: string,
  ) {
    super(userMessage);
  }
}
