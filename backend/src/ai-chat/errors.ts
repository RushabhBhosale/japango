export class AiChatServerError extends Error {
  constructor(
    public readonly code: 'ALL_PROVIDERS_FAILED' | 'AUTH_CONFIGURATION_ERROR' | 'INVALID_RESPONSE' | 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED' | 'TIMEOUT',
    public readonly retryable: boolean,
    public readonly userMessage: string,
  ) {
    super(code);
  }
}
