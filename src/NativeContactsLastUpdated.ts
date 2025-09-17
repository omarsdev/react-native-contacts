import {
  TurboModuleRegistry,
  NativeModules,
  type TurboModule,
} from 'react-native';

export type Contact = {
  id: string;
  displayName: string;
  phoneNumbers: string[];
  givenName?: string | null;
  familyName?: string | null;
  // Android provides this; iOS will set null (not available via CNContacts)
  lastUpdatedAt?: number | null;
};

export interface Spec extends TurboModule {
  // Simple sample kept for template parity
  multiply(a: number, b: number): number;

  // Paged full fetch; on Android sorted by last updated desc.
  // iOS order is undefined (CNContacts doesn’t expose last updated).
  getAll(offset: number, limit: number): Contact[];

  // Paged delta fetch since a platform token.
  // Android expects `since` to be a millisecond timestamp as string.
  // iOS expects `since` to be a base64-encoded CNChangeHistory token.
  // Returns the next token to persist after finishing all pages from this call.
  getUpdatedSince(
    since: string,
    offset: number,
    limit: number
  ): { items: Contact[]; nextSince: string };

  // Persisted-delta helpers (native keeps a small token, not contacts)
  getPersistedSince(): string;
  getUpdatedFromPersisted(
    offset: number,
    limit: number
  ): { items: Contact[]; nextSince: string };
  commitPersisted(nextSince: string): void;
}

function createFallbackModule(): Spec {
  let persistedToken = '';

  return {
    multiply: (a: number, b: number) => a * b,
    getAll: () => [],
    getUpdatedSince: () => ({ items: [], nextSince: persistedToken }),
    getPersistedSince: () => persistedToken,
    getUpdatedFromPersisted: () => ({ items: [], nextSince: persistedToken }),
    commitPersisted: (nextSince: string) => {
      persistedToken = nextSince;
    },
  } as Spec;
}

const NativeModule: Spec =
  TurboModuleRegistry.get<Spec>('ContactsLastUpdated') ??
  (NativeModules.ContactsLastUpdated as Spec | undefined) ??
  createFallbackModule();

if (NativeModule === undefined || NativeModule === null) {
  throw new Error('ContactsLastUpdated native module unavailable.');
}

if (!('multiply' in NativeModule)) {
  console.warn(
    'ContactsLastUpdated native module missing expected methods. Using fallback implementation.'
  );
}

export default NativeModule;
