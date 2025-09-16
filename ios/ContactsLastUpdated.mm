#import "ContactsLastUpdated.h"
#import <Contacts/Contacts.h>

@implementation ContactsLastUpdated
RCT_EXPORT_MODULE()

- (NSNumber *)multiply:(double)a b:(double)b {
    NSNumber *result = @(a * b);

    return result;
}

static NSString *const kCLUPersistedSinceKey = @"ContactsLastUpdatedPersistedSince";

// Persisted token helpers (stores a small change-history token, not contacts)
- (NSString *)getPersistedSince
{
    NSString *v = [[NSUserDefaults standardUserDefaults] stringForKey:kCLUPersistedSinceKey];
    return v ?: @"";
}

- (NSDictionary *)getUpdatedFromPersisted:(double)offset limit:(double)limit
{
    NSInteger off = (NSInteger)MAX(0, offset);
    NSInteger lim = (NSInteger)MAX(0, limit);
    CNContactStore *store = [CNContactStore new];

    NSString *sinceStr = [[NSUserDefaults standardUserDefaults] stringForKey:kCLUPersistedSinceKey];
    NSData *startToken = nil;
    if (sinceStr != nil && sinceStr.length > 0) {
        startToken = [[NSData alloc] initWithBase64EncodedString:sinceStr options:0];
    }

    NSMutableOrderedSet<NSString *> *changedIds = [NSMutableOrderedSet orderedSet];
    NSError *err = nil;

    if (startToken) {
        CNChangeHistoryFetchRequest *ch = [CNChangeHistoryFetchRequest new];
        ch.startingToken = startToken;
        BOOL ok = [store enumerateChangeHistoryForFetchRequest:ch
                                                        error:&err
                                                   usingBlock:^(CNChangeHistoryEvent * _Nonnull event, BOOL * _Nonnull stop) {
            if ([event isKindOfClass:[CNChangeHistoryAddContactEvent class]]) {
                CNChangeHistoryAddContactEvent *e = (CNChangeHistoryAddContactEvent *)event;
                if (e.contact.identifier) [changedIds addObject:e.contact.identifier];
            } else if ([event isKindOfClass:[CNChangeHistoryUpdateContactEvent class]]) {
                CNChangeHistoryUpdateContactEvent *e = (CNChangeHistoryUpdateContactEvent *)event;
                if (e.contact.identifier) [changedIds addObject:e.contact.identifier];
            }
        }];
        if (!ok || err) {
            return @{ @"items": @[], @"nextSince": @"" };
        }
    }

    NSMutableArray<NSDictionary *> *items = [NSMutableArray array];
    if (changedIds.count > 0) {
        NSArray<NSString *> *allIds = changedIds.array;
        NSInteger end = MIN((NSInteger)allIds.count, off + lim);
        if (off < end) {
            NSArray<NSString *> *pageIds = [allIds subarrayWithRange:NSMakeRange(off, end - off)];
            NSArray *keys = @[CNContactIdentifierKey,
                              CNContactGivenNameKey,
                              CNContactFamilyNameKey,
                              CNContactPhoneNumbersKey];
            NSPredicate *pred = [CNContact predicateForContactsWithIdentifiers:pageIds];
            NSError *fetchErr = nil;
            NSArray<CNContact *> *contacts = [store unifiedContactsMatchingPredicate:pred keysToFetch:keys error:&fetchErr];
            if (!fetchErr && contacts) {
                for (CNContact *contact in contacts) {
                    NSMutableArray *phones = [NSMutableArray new];
                    for (CNLabeledValue<CNPhoneNumber *> *lv in contact.phoneNumbers) {
                        CNPhoneNumber *pn = lv.value;
                        if (pn.stringValue) [phones addObject:pn.stringValue];
                    }
                    NSString *displayName = [NSString stringWithFormat:@"%@%@%@",
                                              contact.givenName ?: @"",
                                              (contact.givenName.length > 0 && contact.familyName.length > 0) ? @" " : @"",
                                              contact.familyName ?: @""];
                    [items addObject:@{
                        @"id": contact.identifier ?: @"",
                        @"displayName": displayName ?: @"",
                        @"phoneNumbers": phones,
                        @"givenName": contact.givenName ?: [NSNull null],
                        @"familyName": contact.familyName ?: [NSNull null],
                        @"lastUpdatedAt": [NSNull null],
                    }];
                }
            }
        }
    }

    NSData *newToken = store.currentHistoryToken;
    NSString *nextSince = newToken != nil ? [newToken base64EncodedStringWithOptions:0] : @"";
    return @{ @"items": items, @"nextSince": nextSince ?: @"" };
}

- (void)commitPersisted:(NSString *)nextSince
{
    if (nextSince == nil) return;
    [[NSUserDefaults standardUserDefaults] setObject:nextSince forKey:kCLUPersistedSinceKey];
    [[NSUserDefaults standardUserDefaults] synchronize];
}

// Paged full fetch. iOS cannot sort by last updated (not exposed),
// so the order is undefined. Use small limits for performance.
- (NSArray<NSDictionary *> *)getAll:(double)offset limit:(double)limit
{
    NSInteger off = (NSInteger)MAX(0, offset);
    NSInteger lim = (NSInteger)MAX(0, limit);

    CNContactStore *store = [CNContactStore new];
    NSError *err = nil;

    NSArray *keys = @[CNContactIdentifierKey,
                      CNContactGivenNameKey,
                      CNContactFamilyNameKey,
                      CNContactPhoneNumbersKey];
    CNContactFetchRequest *request = [[CNContactFetchRequest alloc] initWithKeysToFetch:keys];

    NSMutableArray<NSDictionary *> *results = [NSMutableArray arrayWithCapacity:lim];
    __block NSInteger index = -1;
    BOOL ok = [store enumerateContactsWithFetchRequest:request
                                                error:&err
                                           usingBlock:^(CNContact * _Nonnull contact, BOOL * _Nonnull stop) {
        index += 1;
        if (index < off) { return; }
        if ((NSInteger)results.count >= lim) { *stop = YES; return; }

        NSMutableArray *phones = [NSMutableArray new];
        for (CNLabeledValue<CNPhoneNumber *> *lv in contact.phoneNumbers) {
            CNPhoneNumber *pn = lv.value;
            if (pn.stringValue) [phones addObject:pn.stringValue];
        }

        NSString *displayName = [NSString stringWithFormat:@"%@%@%@",
                                  contact.givenName ?: @"",
                                  (contact.givenName.length > 0 && contact.familyName.length > 0) ? @" " : @"",
                                  contact.familyName ?: @""];

        [results addObject:@{
            @"id": contact.identifier ?: @"",
            @"displayName": displayName ?: @"",
            @"phoneNumbers": phones,
            @"givenName": contact.givenName ?: [NSNull null],
            @"familyName": contact.familyName ?: [NSNull null],
            @"lastUpdatedAt": [NSNull null],
        }];
    }];

    if (!ok || err) {
        // On error, return empty list
        return @[];
    }
    return results;
}

// Paged delta since a change-history token. If `since` is empty, no items are returned
// and the current token is provided as nextSince.
- (NSDictionary *)getUpdatedSince:(NSString *)since offset:(double)offset limit:(double)limit
{
    NSInteger off = (NSInteger)MAX(0, offset);
    NSInteger lim = (NSInteger)MAX(0, limit);
    CNContactStore *store = [CNContactStore new];

    NSData *startToken = nil;
    if (since != nil && since.length > 0) {
        startToken = [[NSData alloc] initWithBase64EncodedString:since options:0];
    }

    NSMutableOrderedSet<NSString *> *changedIds = [NSMutableOrderedSet orderedSet];
    NSError *err = nil;

    if (startToken) {
        // Use change history to collect added/updated identifiers
        CNChangeHistoryFetchRequest *ch = [CNChangeHistoryFetchRequest new];
        ch.startingToken = startToken;

        BOOL ok = [store enumerateChangeHistoryForFetchRequest:ch
                                                        error:&err
                                                   usingBlock:^(CNChangeHistoryEvent * _Nonnull event, BOOL * _Nonnull stop) {
            // Add contacts changed
            if ([event isKindOfClass:[CNChangeHistoryAddContactEvent class]]) {
                CNChangeHistoryAddContactEvent *e = (CNChangeHistoryAddContactEvent *)event;
                if (e.contact.identifier) [changedIds addObject:e.contact.identifier];
            } else if ([event isKindOfClass:[CNChangeHistoryUpdateContactEvent class]]) {
                CNChangeHistoryUpdateContactEvent *e = (CNChangeHistoryUpdateContactEvent *)event;
                if (e.contact.identifier) [changedIds addObject:e.contact.identifier];
            }
        }];
        if (!ok || err) {
            return @{ @"items": @[], @"nextSince": @"" };
        }
    }

    // Fetch full contacts for the requested page of identifiers
    NSMutableArray<NSDictionary *> *items = [NSMutableArray array];
    if (changedIds.count > 0) {
        NSArray<NSString *> *allIds = changedIds.array;
        NSInteger end = MIN((NSInteger)allIds.count, off + lim);
        if (off < end) {
            NSArray<NSString *> *pageIds = [allIds subarrayWithRange:NSMakeRange(off, end - off)];

            NSArray *keys = @[CNContactIdentifierKey,
                              CNContactGivenNameKey,
                              CNContactFamilyNameKey,
                              CNContactPhoneNumbersKey];
            NSPredicate *pred = [CNContact predicateForContactsWithIdentifiers:pageIds];
            NSError *fetchErr = nil;
            NSArray<CNContact *> *contacts = [store unifiedContactsMatchingPredicate:pred keysToFetch:keys error:&fetchErr];
            if (!fetchErr && contacts) {
                for (CNContact *contact in contacts) {
                    NSMutableArray *phones = [NSMutableArray new];
                    for (CNLabeledValue<CNPhoneNumber *> *lv in contact.phoneNumbers) {
                        CNPhoneNumber *pn = lv.value;
                        if (pn.stringValue) [phones addObject:pn.stringValue];
                    }
                    NSString *displayName = [NSString stringWithFormat:@"%@%@%@",
                                              contact.givenName ?: @"",
                                              (contact.givenName.length > 0 && contact.familyName.length > 0) ? @" " : @"",
                                              contact.familyName ?: @""];
                    [items addObject:@{
                        @"id": contact.identifier ?: @"",
                        @"displayName": displayName ?: @"",
                        @"phoneNumbers": phones,
                        @"givenName": contact.givenName ?: [NSNull null],
                        @"familyName": contact.familyName ?: [NSNull null],
                        @"lastUpdatedAt": [NSNull null],
                    }];
                }
            }
        }
    }

    // Provide the current token to persist after finishing all pages
    NSData *newToken = store.currentHistoryToken;
    NSString *nextSince = newToken != nil ? [newToken base64EncodedStringWithOptions:0] : @"";
    return @{ @"items": items, @"nextSince": nextSince ?: @"" };
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeContactsLastUpdatedSpecJSI>(params);
}

@end
