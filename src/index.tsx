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
    const page = ContactsLastUpdated.getAll(cursor, pageSize);
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
export function getUpdatedSincePaged(
  since: string,
  offset: number,
  limit: number
): UpdatedPage {
  const result = ContactsLastUpdated.getUpdatedSince(since, offset, limit);
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
export function getPersistedSince() {
  return ContactsLastUpdated.getPersistedSince();
}

export function getUpdatedFromPersistedPaged(
  offset: number,
  limit: number
): UpdatedPage {
  const result = ContactsLastUpdated.getUpdatedFromPersisted(offset, limit);
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

export function commitPersisted(nextSince: string) {
  return ContactsLastUpdated.commitPersisted(nextSince);
}

export function getById(id: string) {
  return ContactsLastUpdated.getById(id);
}
