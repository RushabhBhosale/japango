export class AiServerError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean, public readonly userMessage: string) { super(code); }
}
