import ContactsLastUpdated from './NativeContactsLastUpdated';
import type { Contact, ContactChange } from './NativeContactsLastUpdated';
export type {
  Contact,
  ContactChange,
  PhoneNumberChanges,
  PhoneNumberUpdate,
} from './NativeContactsLastUpdated';

type DeltaPage = {
  mode: 'delta';
  items: ContactChange[];
  nextSince: string;
};

type FullPage = {
  mode: 'full';
  items: Contact[];
  nextSince: string;
};

export type UpdatedPage = DeltaPage | FullPage;

// Convenience: fetch contacts either by page or entire list.
// Provide `limit` to fetch a single page; omit to stream until exhaustion starting at optional `offset`.
export async function getAll(options?: {
  offset?: number;
  limit?: number;
  pageSize?: number;
}): Promise<Contact[]> {
  const offset = options?.offset ?? 0;
  if (typeof options?.limit === 'number') {
    return ContactsLastUpdated.getAll(offset, options.limit);
  }
  const pageSize = options?.pageSize ?? 500;
  let cursor = offset;
  const results: Contact[] = [];
  while (true) {
    const page = await ContactsLastUpdated.getAll(cursor, pageSize);
    if (!page || page.length === 0) break;
    results.push(...page);
    cursor += page.length;
    if (page.length < pageSize) break;
  }
  return results;
}

// Paged API: Delta list since a token.
// Android: token is a millisecond timestamp string.
// iOS: token is a base64-encoded CNChangeHistory token.
export async function getUpdatedSincePaged(
  since: string,
  offset: number,
  limit: number
): Promise<UpdatedPage> {
  const result = await ContactsLastUpdated.getUpdatedSince(
    since,
    offset,
    limit
  );
  const nextSince = result.nextSince ?? '';
  if (result.mode === 'full') {
    return {
      mode: 'full',
      items: result.items,
      nextSince,
    };
  }
  if (!nextSince && since.trim().length === 0) {
    return {
      mode: 'full',
      items: (result as unknown as { items: Contact[] }).items,
      nextSince,
    };
  }
  return {
    mode: 'delta',
    items: result.items,
    nextSince,
  };
}

// Persisted-delta helpers
export async function getPersistedSince(): Promise<string> {
  return ContactsLastUpdated.getPersistedSince();
}

export async function getUpdatedFromPersistedPaged(
  offset: number,
  limit: number
): Promise<UpdatedPage> {
  const result = await ContactsLastUpdated.getUpdatedFromPersisted(
    offset,
    limit
  );
  const nextSince = result.nextSince ?? '';
  if (result.mode === 'full' || !nextSince) {
    return {
      mode: 'full',
      items: (result as unknown as { items: Contact[] }).items,
      nextSince,
    };
  }
  return {
    mode: 'delta',
    items: result.items,
    nextSince,
  };
}

export async function commitPersisted(nextSince: string): Promise<void> {
  await ContactsLastUpdated.commitPersisted(nextSince);
}

export async function getById(id: string): Promise<Contact | null> {
  return ContactsLastUpdated.getById(id);
}
