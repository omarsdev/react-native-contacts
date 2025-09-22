import ContactsLastUpdated from './NativeContactsLastUpdated';
import type { Contact } from './NativeContactsLastUpdated';
export type {
  Contact,
  ContactChange,
  PhoneNumberChanges,
  PhoneNumberUpdate,
} from './NativeContactsLastUpdated';

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
) {
  return ContactsLastUpdated.getUpdatedSince(since, offset, limit);
}

// Persisted-delta helpers
export function getPersistedSince() {
  return ContactsLastUpdated.getPersistedSince();
}

export function getUpdatedFromPersistedPaged(offset: number, limit: number) {
  return ContactsLastUpdated.getUpdatedFromPersisted(offset, limit);
}

export function commitPersisted(nextSince: string) {
  return ContactsLastUpdated.commitPersisted(nextSince);
}

export function getById(id: string) {
  return ContactsLastUpdated.getById(id);
}
