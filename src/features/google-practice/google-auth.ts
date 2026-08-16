import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { NativeModules, Platform } from 'react-native';
import { z } from 'zod';

export const googleDriveFileScope = 'https://www.googleapis.com/auth/drive.file';

export type GooglePracticeAuthErrorCode =
  | 'AUTH_CANCELLED'
  | 'AUTH_EXPIRED'
  | 'CONFIGURATION'
  | 'DOCUMENT_NOT_SELECTED'
  | 'INVALID_RESPONSE'
  | 'NETWORK';

export class GooglePracticeAuthError extends Error {
  constructor(
    readonly code: GooglePracticeAuthErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'GooglePracticeAuthError';
  }
}

interface GoogleDrivePickerNativeModule {
  pickGoogleDocument: () => Promise<unknown>;
}

const pickerResultSchema = z.object({
  documentId: z.string().min(1),
}).strict();

let configured = false;

function configuredClientId(name: string, value: string | undefined): string {
  const clientId = value?.trim();
  if (!clientId) {
    throw new GooglePracticeAuthError(
      'CONFIGURATION',
      `Google Practice Sync needs ${name} in this native build.`,
    );
  }
  return clientId;
}

function configureGoogleSignIn(): void {
  if (configured) return;
  if (Platform.OS === 'web') {
    throw new GooglePracticeAuthError(
      'CONFIGURATION',
      'Google Practice Sync requires an Android or iOS development build.',
    );
  }

  const webClientId = configuredClientId(
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  );

  const iosClientId = Platform.OS === 'ios'
    ? configuredClientId(
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    )
    : undefined;

  if (Platform.OS === 'android') {
    configuredClientId(
      'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    );
  }

  GoogleSignin.configure({
    webClientId,
    iosClientId,
    scopes: [googleDriveFileScope],
    offlineAccess: false,
  });
  configured = true;
}

function mapNativeError(error: unknown, fallback: string): GooglePracticeAuthError {
  if (error instanceof GooglePracticeAuthError) return error;
  if (isErrorWithCode(error)) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === 'AUTH_CANCELLED') {
      return new GooglePracticeAuthError('AUTH_CANCELLED', 'Google connection was cancelled.');
    }
    if (error.code === statusCodes.SIGN_IN_REQUIRED || error.code === 'SIGN_IN_REQUIRED') {
      return new GooglePracticeAuthError('AUTH_EXPIRED', 'Your Google connection expired. Reconnect to continue syncing.');
    }
    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return new GooglePracticeAuthError('CONFIGURATION', 'Google Play services must be installed and up to date.');
    }
    if (error.code === statusCodes.IN_PROGRESS || error.code === 'IN_PROGRESS') {
      return new GooglePracticeAuthError('NETWORK', 'Google sign-in is already open.', true);
    }
    if (error.code === 'DOCUMENT_NOT_SELECTED') {
      return new GooglePracticeAuthError('DOCUMENT_NOT_SELECTED', 'Choose one Google Doc to use as the JapanGo Practice Log.');
    }
    if (error.code === 'NETWORK_ERROR' || error.code === '7') {
      return new GooglePracticeAuthError('NETWORK', 'Google could not be reached. Check your connection and try again.', true);
    }
  }
  return new GooglePracticeAuthError('INVALID_RESPONSE', fallback);
}

async function requireSignedInAccount(): Promise<void> {
  configureGoogleSignIn();
  if (!GoogleSignin.hasPreviousSignIn()) {
    throw new GooglePracticeAuthError('AUTH_EXPIRED', 'Your Google connection expired. Reconnect to continue syncing.');
  }
  try {
    const response = await GoogleSignin.signInSilently();
    if (isNoSavedCredentialFoundResponse(response)) {
      throw new GooglePracticeAuthError('AUTH_EXPIRED', 'Your Google connection expired. Reconnect to continue syncing.');
    }
  } catch (error) {
    throw mapNativeError(error, 'Google could not restore your account. Reconnect to continue syncing.');
  }
}

export async function connectGooglePracticeNative(): Promise<void> {
  configureGoogleSignIn();
  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) {
      throw new GooglePracticeAuthError('AUTH_CANCELLED', 'Google connection was cancelled.');
    }
    const tokens = await GoogleSignin.getTokens();
    if (!tokens.accessToken) {
      throw new GooglePracticeAuthError('INVALID_RESPONSE', 'Google did not return permission to read the selected document.');
    }
  } catch (error) {
    throw mapNativeError(error, 'Google could not finish connecting. Please try again.');
  }
}

export async function getGooglePracticeAccessToken(forceRefresh = false): Promise<string> {
  await requireSignedInAccount();
  try {
    let tokens = await GoogleSignin.getTokens();
    if (forceRefresh && tokens.accessToken) {
      await GoogleSignin.clearCachedAccessToken(tokens.accessToken);
      tokens = await GoogleSignin.getTokens();
    }
    if (!tokens.accessToken) {
      throw new GooglePracticeAuthError('AUTH_EXPIRED', 'Your Google connection expired. Reconnect to continue syncing.');
    }
    return tokens.accessToken;
  } catch (error) {
    throw mapNativeError(error, 'Google could not refresh your connection. Reconnect to continue syncing.');
  }
}

export async function chooseGooglePracticeDocumentNative(): Promise<string> {
  await requireSignedInAccount();
  if (Platform.OS !== 'android') {
    throw new GooglePracticeAuthError(
      'CONFIGURATION',
      'Google document selection is currently available in the Android native build.',
    );
  }

  const picker = NativeModules.JapanGoGoogleDrivePicker as GoogleDrivePickerNativeModule | undefined;
  if (!picker) {
    throw new GooglePracticeAuthError(
      'CONFIGURATION',
      'Google document selection needs a newly rebuilt Android development app.',
    );
  }

  try {
    const result = pickerResultSchema.safeParse(await picker.pickGoogleDocument());
    if (!result.success) {
      throw new GooglePracticeAuthError('INVALID_RESPONSE', 'Google did not return a valid document selection.');
    }
    return result.data.documentId;
  } catch (error) {
    throw mapNativeError(error, 'Google could not open the document picker. Please try again.');
  }
}

export function hasGooglePracticeNativeSession(): boolean {
  try {
    configureGoogleSignIn();
    return GoogleSignin.hasPreviousSignIn();
  } catch {
    return false;
  }
}

export async function disconnectGooglePracticeNative(): Promise<void> {
  try {
    configureGoogleSignIn();
  } catch {
    return;
  }
  try {
    if (GoogleSignin.hasPreviousSignIn()) {
      await GoogleSignin.revokeAccess();
    }
  } catch {
    // Local sign-out must still succeed if revocation is unavailable.
  } finally {
    await GoogleSignin.signOut().catch(() => null);
  }
}
