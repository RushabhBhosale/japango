import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

import {
  chooseGooglePracticeDocumentNative,
  connectGooglePracticeNative,
  disconnectGooglePracticeNative,
  getGooglePracticeAccessToken,
  GooglePracticeAuthError,
  hasGooglePracticeNativeSession,
} from '@/features/google-practice/google-auth';
import { parseGooglePracticeDocument, type GooglePracticeDocument } from '@/features/google-practice/parser';
import {
  practiceAnalysisApiErrorSchema,
  practiceAnalysisApiResponseSchema,
} from '@/features/google-practice/schemas';
import {
  disconnectPracticeGoogle,
  getPracticeCurriculumCandidates,
  getPracticeEvidenceSummary,
  getPracticeSyncState,
  getProcessedPracticeSessionIds,
  markPracticeSyncChecked,
  savePracticeImport,
  setPracticeDocument,
  setPracticeGoogleConnected,
} from '@/services/database/google-practice-repository';
import type { PracticeLogSession, PracticeSyncResult } from '@/types/google-practice';

const credentialKey = 'japango.google-practice.credentials.v1';

const googleDocumentSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1),
  body: z.object({
    content: z.array(z.unknown()).optional(),
  }).optional(),
}).passthrough();

export type GooglePracticeSyncErrorCode =
  | 'AUTH_CANCELLED'
  | 'AUTH_EXPIRED'
  | 'CONFIGURATION'
  | 'DOCUMENT_MISSING'
  | 'DOCUMENT_NOT_SELECTED'
  | 'DOCUMENT_UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'NETWORK'
  | 'NOT_CONNECTED'
  | 'INVALID_RESPONSE'
  | 'ANALYSIS_UNAVAILABLE';

export class GooglePracticeSyncError extends Error {
  constructor(
    readonly code: GooglePracticeSyncErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'GooglePracticeSyncError';
  }
}

function apiUrl(path: string): string | undefined {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/u, '');
  return base ? `${base}${path}` : undefined;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeEvidence(value: string): string {
  return value.toLocaleLowerCase('ja-JP').replace(/[\s。、！？!?「」『』"'.,]/gu, '');
}

function mapGoogleAuthError(error: unknown): GooglePracticeSyncError {
  if (error instanceof GooglePracticeSyncError) return error;
  if (error instanceof GooglePracticeAuthError) {
    return new GooglePracticeSyncError(error.code, error.message, error.retryable);
  }
  return new GooglePracticeSyncError('INVALID_RESPONSE', 'Google returned an unexpected response. Please try again.');
}

export async function connectGooglePracticeAccount(): Promise<void> {
  try {
    await connectGooglePracticeNative();
    await SecureStore.deleteItemAsync(credentialKey);
    await setPracticeGoogleConnected(true);
  } catch (error) {
    throw mapGoogleAuthError(error);
  }
}

export async function chooseGooglePracticeDocument(): Promise<string> {
  try {
    const documentId = await chooseGooglePracticeDocumentNative();
    await setPracticeDocument(documentId);
    return documentId;
  } catch (error) {
    throw mapGoogleAuthError(error);
  }
}

export async function hasGooglePracticeCredentials(): Promise<boolean> {
  return hasGooglePracticeNativeSession();
}

async function requestGoogleDocument(documentId: string, retried = false): Promise<GooglePracticeDocument> {
  let accessToken: string;
  try {
    accessToken = await getGooglePracticeAccessToken(retried);
  } catch (error) {
    throw mapGoogleAuthError(error);
  }
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}?suggestionsViewMode=PREVIEW_WITHOUT_SUGGESTIONS`,
      { headers: { authorization: `Bearer ${accessToken}` } },
      20_000,
    );
  } catch {
    throw new GooglePracticeSyncError('NETWORK', 'The practice log could not be downloaded. Your imported history is still available.', true);
  }
  if (response.status === 401 && !retried) return requestGoogleDocument(documentId, true);
  if (response.status === 401) {
    throw new GooglePracticeSyncError('AUTH_EXPIRED', 'Your Google connection expired. Reconnect to continue syncing.');
  }
  if (response.status === 403) {
    throw new GooglePracticeSyncError('PERMISSION_DENIED', 'JapanGo no longer has permission to read that document. Choose the Practice Log again.');
  }
  if (response.status === 404) {
    throw new GooglePracticeSyncError('DOCUMENT_MISSING', 'The selected practice document was moved, deleted, or is no longer shared with JapanGo.');
  }
  if (!response.ok) {
    throw new GooglePracticeSyncError('NETWORK', 'The practice log could not be downloaded. Your imported history is still available.', true);
  }
  let payload: unknown;
  try {
    payload = await response.json() as unknown;
  } catch {
    throw new GooglePracticeSyncError('INVALID_RESPONSE', 'Google returned an unreadable practice document.');
  }
  const parsed = googleDocumentSchema.safeParse(payload);
  if (!parsed.success) throw new GooglePracticeSyncError('DOCUMENT_UNSUPPORTED', 'The selected file is not a readable Google Doc.');
  return parsed.data as GooglePracticeDocument;
}

async function analyzePracticeSessions(sessions: readonly PracticeLogSession[]) {
  const url = apiUrl('/api/practice/analyze');
  if (!url) {
    throw new GooglePracticeSyncError('CONFIGURATION', 'Connect the JapanGo lesson service before importing practice.', false);
  }
  const [curriculumCandidates, existingEvidence] = await Promise.all([
    getPracticeCurriculumCandidates(sessions),
    getPracticeEvidenceSummary(),
  ]);
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessions: sessions.map(({ id, practicedAt, transcript, metadata }) => ({ id, practicedAt, transcript, metadata })),
        curriculumCandidates,
        existingEvidence: existingEvidence.map(({ type, key, mistakes, successfulUses, mastery }) => ({
          type, key, mistakes, successfulUses, mastery,
        })),
      }),
    }, 65_000);
  } catch {
    throw new GooglePracticeSyncError('ANALYSIS_UNAVAILABLE', 'New conversations were found, but analysis is unavailable. Nothing was imported, so you can retry safely.', true);
  }
  let payload: unknown;
  try {
    payload = await response.json() as unknown;
  } catch {
    throw new GooglePracticeSyncError('INVALID_RESPONSE', 'Practice analysis returned unreadable data. Nothing was imported.');
  }
  if (!response.ok) {
    const error = practiceAnalysisApiErrorSchema.safeParse(payload);
    throw new GooglePracticeSyncError(
      'ANALYSIS_UNAVAILABLE',
      error.success ? error.data.error.message ?? 'Practice analysis is unavailable. Nothing was imported.' : 'Practice analysis is unavailable. Nothing was imported.',
      error.success ? Boolean(error.data.error.retryable) : true,
    );
  }
  const result = practiceAnalysisApiResponseSchema.safeParse(payload);
  if (!result.success) throw new GooglePracticeSyncError('INVALID_RESPONSE', 'Practice analysis did not pass JapanGo validation. Nothing was imported.');
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const candidateById = new Map(curriculumCandidates.map((candidate) => [candidate.id, candidate]));
  const returnedIds = new Set<string>();
  for (const analysis of result.data.data.analyses) {
    const session = sessionById.get(analysis.sessionId);
    if (!session || returnedIds.has(analysis.sessionId)) {
      throw new GooglePracticeSyncError('INVALID_RESPONSE', 'Practice analysis referenced an unexpected conversation. Nothing was imported.');
    }
    returnedIds.add(analysis.sessionId);
    const learnerText = session.messages.filter(({ role }) => role === 'user').map(({ content }) => content).join('\n');
    const normalizedLearnerText = normalizeEvidence(learnerText);
    if (analysis.analysis.mistakes.some(({ original }) => {
      const normalizedOriginal = normalizeEvidence(original);
      return !normalizedOriginal || !normalizedLearnerText.includes(normalizedOriginal);
    })) {
      throw new GooglePracticeSyncError('INVALID_RESPONSE', 'Practice analysis attributed unsupported text to the learner. Nothing was imported.');
    }
    for (const link of analysis.curriculumLinks) {
      const candidate = candidateById.get(link.curriculumItemId);
      if (!candidate || candidate.type !== link.type) {
        throw new GooglePracticeSyncError('INVALID_RESPONSE', 'Practice analysis referenced unsupported curriculum. Nothing was imported.');
      }
    }
  }
  if (returnedIds.size !== sessionById.size) {
    throw new GooglePracticeSyncError('INVALID_RESPONSE', 'Practice analysis was incomplete. Nothing was imported.');
  }
  return result.data.data.analyses;
}

export async function syncGooglePractice(): Promise<PracticeSyncResult> {
  const state = await getPracticeSyncState();
  if (!state.googleConnected) throw new GooglePracticeSyncError('NOT_CONNECTED', 'Connect your Google account before syncing.');
  const documentId = state.documentId;
  if (!documentId) throw new GooglePracticeSyncError('DOCUMENT_NOT_SELECTED', 'Choose the Google Doc used as your JapanGo Practice Log.');
  const document = await requestGoogleDocument(documentId);
  const parsed = parseGooglePracticeDocument(document, state.lastProcessedIndex).slice(0, 10);
  const processed = await getProcessedPracticeSessionIds(documentId, parsed.map(({ id }) => id));
  const sessions = parsed.filter(({ id }) => !processed.has(id));
  const syncedAt = new Date().toISOString();
  if (!sessions.length) {
    await markPracticeSyncChecked(document.title, syncedAt, parsed.at(-1));
    return { documentTitle: document.title, newConversationCount: 0, syncedAt };
  }
  const analyses = await analyzePracticeSessions(sessions);
  const newConversationCount = await savePracticeImport({
    documentId,
    documentTitle: document.title,
    sessions,
    analyses,
    syncedAt,
  });
  return { documentTitle: document.title, newConversationCount, syncedAt };
}

export async function disconnectGooglePracticeAccount(): Promise<void> {
  try {
    await disconnectGooglePracticeNative();
    await SecureStore.deleteItemAsync(credentialKey);
  } finally {
    await disconnectPracticeGoogle();
  }
}
