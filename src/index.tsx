import ContactsLastUpdated from './NativeContactsLastUpdated';
import type { Contact, ContactChange } from './NativeContactsLastUpdated';
export type {
  Contact,
  ContactChange,
  PhoneNumberChanges,
  PhoneNumberUpdate,
} from './NativeContactsLastUpdated';

type UpdatedPageBase = {
  nextSince: string;
  totalContacts: number;
};

export type UpdatedPage = UpdatedPageBase & {
  mode: 'delta' | 'full';
  items: ContactChange[];
};

type UpdatedPageHandler = (
  page: UpdatedPage
) => void | boolean | Promise<void | boolean>;

type SinceListenOptions = {
  since?: string;
  offset?: number;
  pageSize?: number;
};

type ListenWithOptions<TOptions> = {
  (handler: UpdatedPageHandler, options?: TOptions): Promise<void>;
  (options: TOptions, handler: UpdatedPageHandler): Promise<void>;
};

type GetUpdatedSincePagedFn = {
  (since: string, offset: number, limit: number): Promise<UpdatedPage>;
  listen: ListenWithOptions<SinceListenOptions>;
};

const DEFAULT_PAGE_SIZE = 300;

function ensurePositivePageSize(value?: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return DEFAULT_PAGE_SIZE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function normalizeListenArgs<TOptions extends object>(
  arg1: UpdatedPageHandler | TOptions | undefined,
  arg2?: UpdatedPageHandler | TOptions
): { handler: UpdatedPageHandler; options: TOptions } {
  let handler: UpdatedPageHandler | undefined;
  let options: TOptions | undefined;

  if (typeof arg1 === 'function') {
    handler = arg1;
  } else if (isRecord(arg1)) {
    options = arg1 as TOptions;
  }

  if (typeof arg2 === 'function') {
    handler = arg2;
  } else if (isRecord(arg2)) {
    options = arg2 as TOptions;
  }

  if (!handler) {
    throw new TypeError(
      'A page handler function must be provided to listen().'
    );
  }

  return { handler, options: options ?? ({} as TOptions) };
}

function resolveTotalContacts(nativeResult: {
  totalContacts?: number;
  items: unknown;
}): number {
  if (typeof nativeResult.totalContacts === 'number') {
    return nativeResult.totalContacts;
  }
  return Array.isArray(nativeResult.items) ? nativeResult.items.length : 0;
}

function synthesizeChangeFromContact(contact: Contact): ContactChange {
  const numbers = Array.isArray(contact.phoneNumbers)
    ? contact.phoneNumbers
    : [];

  return {
    ...contact,
    changeType: 'created',
    isDeleted: false,
    phoneNumberChanges: {
      created: numbers,
      deleted: [],
      updated: [],
    },
    previous: null,
  };
}

function normalizeDeltaChange(change: ContactChange): ContactChange {
  const changes = change.phoneNumberChanges ?? {
    created: [],
    deleted: [],
    updated: [],
  };

  return {
    ...change,
    changeType: change.changeType ?? (change.isDeleted ? 'deleted' : 'updated'),
    isDeleted: Boolean(change.isDeleted),
    phoneNumberChanges: {
      created: Array.isArray(changes.created) ? changes.created : [],
      deleted: Array.isArray(changes.deleted) ? changes.deleted : [],
      updated: Array.isArray(changes.updated) ? changes.updated : [],
    },
    previous:
      change.previous && typeof change.previous === 'object'
        ? change.previous
        : null,
  };
}

// Convenience: fetch the entire contacts list in one call.
export async function getAll(): Promise<Contact[]> {
  const contacts = await ContactsLastUpdated.getAll();
  return Array.isArray(contacts) ? contacts : [];
}

// Paged API: Delta list since a token.
// Android: token is a millisecond timestamp string.
// iOS: token is a base64-encoded CNChangeHistory token.
const getUpdatedSincePagedImpl = async (
  since: string,
  offset: number,
  limit: number
): Promise<UpdatedPage> => {
  const result = await ContactsLastUpdated.getUpdatedSince(
    since,
    offset,
    limit
  );
  const nextSince = result.nextSince ?? '';
  const totalContacts = resolveTotalContacts(result);
  const shouldTreatAsFull =
    result.mode === 'full' || (since.trim().length === 0 && !nextSince);

  if (shouldTreatAsFull) {
    const contacts =
      result.mode === 'full'
        ? result.items
        : (result as unknown as { items: Contact[] }).items;
    return {
      mode: 'full',
      items: Array.isArray(contacts)
        ? contacts.map(synthesizeChangeFromContact)
        : [],
      nextSince,
      totalContacts,
    };
  }

  const deltas =
    result.mode === 'delta'
      ? result.items
      : (result as unknown as { items: ContactChange[] }).items;
  return {
    mode: 'delta',
    items: Array.isArray(deltas) ? deltas.map(normalizeDeltaChange) : [],
    nextSince,
    totalContacts,
  };
};

export const getUpdatedSincePaged =
  getUpdatedSincePagedImpl as GetUpdatedSincePagedFn;

getUpdatedSincePaged.listen = async function (
  arg1?: UpdatedPageHandler | SinceListenOptions,
  arg2?: UpdatedPageHandler | SinceListenOptions
): Promise<void> {
  const { handler, options } = normalizeListenArgs<SinceListenOptions>(
    arg1,
    arg2
  );
  const baseSince = options.since ?? '';
  let offset = options.offset ?? 0;
  const pageSize = ensurePositivePageSize(options.pageSize);

  while (true) {
    const page = await getUpdatedSincePaged(baseSince, offset, pageSize);
    const handlerResult = await handler(page);
    if (handlerResult === false) {
      break;
    }

    const length = Array.isArray(page.items) ? page.items.length : 0;
    if (length <= 0) {
      break;
    }

    offset += length;
    if (length < pageSize) {
      break;
    }
  }
};

// Persisted-delta helpers
export async function getPersistedSince(): Promise<string> {
  return ContactsLastUpdated.getPersistedSince();
}

export async function commitPersisted(nextSince: string): Promise<void> {
  await ContactsLastUpdated.commitPersisted(nextSince);
}

export async function getById(id: string): Promise<Contact | null> {
  return ContactsLastUpdated.getById(id);
}
