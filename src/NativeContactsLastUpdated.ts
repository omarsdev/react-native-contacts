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

export type PhoneNumberUpdate = {
  previous: string;
  current: string;
};

export type PhoneNumberChanges = {
  created: string[];
  deleted: string[];
  updated: PhoneNumberUpdate[];
};

export type ContactChange = Contact & {
  changeType: 'created' | 'updated' | 'deleted';
  isDeleted: boolean;
  phoneNumberChanges: PhoneNumberChanges;
  previous?: {
    displayName?: string | null;
    givenName?: string | null;
    familyName?: string | null;
    phoneNumbers: string[];
  } | null;
};

type NativeDeltaResult = {
  items: ContactChange[];
  nextSince: string;
  mode?: 'delta';
};

type NativeFullResult = {
  items: Contact[];
  nextSince: string;
  mode: 'full';
};

export type NativeUpdatedResult = NativeDeltaResult | NativeFullResult;

export interface Spec extends TurboModule {
  // Paged full fetch; on Android sorted by last updated desc.
  // iOS order is undefined (CNContacts doesn’t expose last updated).
  getAll(offset: number, limit: number): Promise<Contact[]>;

  // Retrieve a single contact by identifier if it exists.
  getById(id: string): Promise<Contact | null>;

  // Paged delta fetch since a platform token.
  // Android expects `since` to be a millisecond timestamp as string.
  // iOS expects `since` to be a base64-encoded CNChangeHistory token.
  // Returns the next token to persist after finishing all pages from this call.
  getUpdatedSince(
    since: string,
    offset: number,
    limit: number
  ): Promise<NativeUpdatedResult>;

  // Persisted-delta helpers (native keeps a small token, not contacts)
  getPersistedSince(): Promise<string>;
  getUpdatedFromPersisted(
    offset: number,
    limit: number
  ): Promise<NativeUpdatedResult>;
  commitPersisted(nextSince: string): Promise<void>;
}

function createFallbackModule(): Spec {
  let persistedToken = '';

  return {
    getAll: async () => [],
    getById: async () => null,
    getUpdatedSince: async () => ({
      items: [] as ContactChange[],
      nextSince: persistedToken,
      mode: 'delta',
    }),
    getPersistedSince: async () => persistedToken,
    getUpdatedFromPersisted: async () => ({
      items: [] as ContactChange[],
      nextSince: persistedToken,
      mode: 'delta',
    }),
    commitPersisted: async (nextSince: string) => {
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

if (
  !('getAll' in NativeModule) ||
  !('getById' in NativeModule) ||
  !('getUpdatedSince' in NativeModule)
) {
  console.warn(
    'ContactsLastUpdated native module missing expected methods. Using fallback implementation.'
  );
}

export default NativeModule;
