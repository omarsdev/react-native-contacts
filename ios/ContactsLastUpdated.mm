#import "ContactsLastUpdated.h"
#import <Contacts/Contacts.h>
#import <Foundation/Foundation.h>

@implementation ContactsLastUpdated
RCT_EXPORT_MODULE()

- (NSNumber *)multiply:(double)a b:(double)b {
    NSNumber *result = @(a * b);

    return result;
}

static NSString *const kCLUPersistedSinceKey = @"ContactsLastUpdatedPersistedSince";
static NSString *const kCLUSnapshotDirName = @"ContactsLastUpdated";
static NSString *const kCLUSnapshotFileName = @"fp.plist";

// Cache last computed delta for paging
static NSArray<NSDictionary *> *gCLU_LastDeltaItems = nil;

// Simple 64-bit FNV-1a hash for compact fingerprints
static uint64_t CLUFNV1a64(const void *data, size_t len) {
    const uint8_t *bytes = (const uint8_t *)data;
    uint64_t hash = 1469598103934665603ULL; // offset basis
    for (size_t i = 0; i < len; i++) {
        hash ^= bytes[i];
        hash *= 1099511628211ULL; // FNV prime
    }
    return hash;
}

static uint64_t CLUHashString(NSString *s) {
    if (!s) return 0;
    NSData *d = [s dataUsingEncoding:NSUTF8StringEncoding];
    return CLUFNV1a64(d.bytes, d.length);
}

static NSString *CLUNormalizePhone(NSString *p) {
    if (!p) return @"";
    NSCharacterSet *nonDigits = [[NSCharacterSet decimalDigitCharacterSet] invertedSet];
    return [[p componentsSeparatedByCharactersInSet:nonDigits] componentsJoinedByString:@""];
}

static uint64_t CLUContactFingerprint(CNContact *c) {
    NSMutableArray<NSString *> *parts = [NSMutableArray arrayWithCapacity:6];
    if (c.givenName) [parts addObject:c.givenName];
    if (c.familyName) [parts addObject:c.familyName];
    if ([c isKeyAvailable:CNContactPhoneNumbersKey]) {
        NSMutableArray<NSString *> *phones = [NSMutableArray arrayWithCapacity:c.phoneNumbers.count];
        for (CNLabeledValue<CNPhoneNumber *> *lv in c.phoneNumbers) {
            CNPhoneNumber *pn = lv.value;
            if (pn.stringValue) [phones addObject:CLUNormalizePhone(pn.stringValue)];
        }
        [phones sortUsingSelector:@selector(compare:)];
        [parts addObject:[phones componentsJoinedByString:@","]];
    }
    NSString *joined = [parts componentsJoinedByString:@"|"];
    return CLUHashString(joined.lowercaseString);
}

static NSString *CLUSnapshotPath(void) {
    NSArray<NSString *> *paths = NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES);
    NSString *dir = paths.firstObject ?: NSTemporaryDirectory();
    NSString *folder = [dir stringByAppendingPathComponent:kCLUSnapshotDirName];
    [[NSFileManager defaultManager] createDirectoryAtPath:folder withIntermediateDirectories:YES attributes:nil error:nil];
    return [folder stringByAppendingPathComponent:kCLUSnapshotFileName];
}

static NSMutableDictionary<NSString *, NSNumber *> *CLULoadSnapshot(void) {
    NSDictionary *d = [NSDictionary dictionaryWithContentsOfFile:CLUSnapshotPath()];
    if ([d isKindOfClass:[NSDictionary class]]) return [d mutableCopy];
    return [NSMutableDictionary new];
}

static void CLUSaveSnapshot(NSDictionary<NSString *, NSNumber *> *snapshot) {
    if (!snapshot) return;
    [snapshot writeToFile:CLUSnapshotPath() atomically:YES];
}

static NSString *CLUDisplayName(CNContact *c) {
    NSString *g = c.givenName ?: @"";
    NSString *f = c.familyName ?: @"";
    if (g.length > 0 && f.length > 0) return [NSString stringWithFormat:@"%@ %@", g, f];
    return g.length > 0 ? g : f;
}

static NSDictionary *CLUContactToDict(CNContact *c) {
    NSMutableArray *phones = [NSMutableArray new];
    for (CNLabeledValue<CNPhoneNumber *> *lv in c.phoneNumbers) {
        CNPhoneNumber *pn = lv.value;
        if (pn.stringValue) [phones addObject:pn.stringValue];
    }
    return @{
        @"id": c.identifier ?: @"",
        @"displayName": CLUDisplayName(c) ?: @"",
        @"phoneNumbers": phones,
        @"givenName": c.givenName ?: [NSNull null],
        @"familyName": c.familyName ?: [NSNull null],
        @"lastUpdatedAt": [NSNull null],
    };
}

static NSArray<NSDictionary *> *CLUComputeDeltaContacts(CNContactStore *store, NSDictionary<NSString *, NSNumber *> *snapshot) {
    if (!snapshot || snapshot.count == 0) return @[]; // first run: no delta
    NSError *err = nil;
    NSArray *keys = @[CNContactIdentifierKey, CNContactGivenNameKey, CNContactFamilyNameKey, CNContactPhoneNumbersKey];
    CNContactFetchRequest *req = [[CNContactFetchRequest alloc] initWithKeysToFetch:keys];
    NSMutableArray<NSDictionary *> *changed = [NSMutableArray array];
    BOOL ok = [store enumerateContactsWithFetchRequest:req error:&err usingBlock:^(CNContact * _Nonnull contact, BOOL * _Nonnull stop) {
        NSNumber *prev = snapshot[contact.identifier ?: @""];
        uint64_t fp = CLUContactFingerprint(contact);
        if (!prev || prev.unsignedLongLongValue != fp) {
            [changed addObject:CLUContactToDict(contact)];
        }
    }];
    if (!ok || err) return @[];
    return changed;
}

static void CLURebuildSnapshot(CNContactStore *store) {
    NSError *err = nil;
    NSArray *keys = @[CNContactIdentifierKey, CNContactGivenNameKey, CNContactFamilyNameKey, CNContactPhoneNumbersKey];
    CNContactFetchRequest *req = [[CNContactFetchRequest alloc] initWithKeysToFetch:keys];
    NSMutableDictionary<NSString *, NSNumber *> *snap = [NSMutableDictionary dictionary];
    [store enumerateContactsWithFetchRequest:req error:&err usingBlock:^(CNContact * _Nonnull contact, BOOL * _Nonnull stop) {
        uint64_t fp = CLUContactFingerprint(contact);
        snap[contact.identifier ?: @""] = @(fp);
    }];
    if (!err) CLUSaveSnapshot(snap);
}

// Helper: enumerate change history via whichever selector is available on this SDK.
- (BOOL)clu_enumerateChangeHistoryInStore:(CNContactStore *)store
                               startToken:(NSData *)startToken
                              usingBlock:(void (^)(CNChangeHistoryEvent *event, BOOL *stop))block
{
    if (startToken == nil) return YES;
    CNChangeHistoryFetchRequest *ch = [CNChangeHistoryFetchRequest new];
    ch.startingToken = startToken;

    // Best-effort enable useful flags via KVC (SDKs differ in naming/availability)
    @try { [ch setValue:@(YES) forKey:@"shouldUnifyResults"]; } @catch (...) {}
    @try { [ch setValue:@(YES) forKey:@"includePropertyChanges"]; } @catch (...) {}
    @try { [ch setValue:@(YES) forKey:@"includeGroupChanges"]; } @catch (...) {}

    // Prefer modern API
    SEL selModern = NSSelectorFromString(@"enumerateChangeHistoryForFetchRequest:error:usingBlock:");
    if ([store respondsToSelector:selModern]) {
        NSMethodSignature *sig = [store methodSignatureForSelector:selModern];
        if (!sig) return NO;
        NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
        [inv setSelector:selModern];
        [inv setTarget:store];
        [inv retainArguments];
        NSError *tmpErr = nil;
        CNChangeHistoryFetchRequest *req = ch;
        void (^handler)(CNChangeHistoryEvent *, BOOL *) = block;
        [inv setArgument:&req atIndex:2];
        [inv setArgument:&tmpErr atIndex:3];
        [inv setArgument:&handler atIndex:4];
        [inv invoke];
        BOOL ok = NO;
        [inv getReturnValue:&ok];
        return ok && (tmpErr == nil);
    }

    // Fallback to older API name if present
    SEL selLegacy = NSSelectorFromString(@"enumerateChangeHistoryWithFetchRequest:error:eventHandler:");
    if ([store respondsToSelector:selLegacy]) {
        NSMethodSignature *sig = [store methodSignatureForSelector:selLegacy];
        if (!sig) return NO;
        NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
        [inv setSelector:selLegacy];
        [inv setTarget:store];
        [inv retainArguments];
        NSError *tmpErr = nil;
        CNChangeHistoryFetchRequest *req = ch;
        void (^handler)(CNChangeHistoryEvent *, BOOL *) = block;
        [inv setArgument:&req atIndex:2];
        [inv setArgument:&tmpErr atIndex:3];
        [inv setArgument:&handler atIndex:4];
        [inv invoke];
        BOOL ok = NO;
        [inv getReturnValue:&ok];
        return ok && (tmpErr == nil);
    }

    return NO;
}

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
        BOOL ok = [self clu_enumerateChangeHistoryInStore:store
                                               startToken:startToken
                                              usingBlock:^(CNChangeHistoryEvent * _Nonnull event, BOOL * _Nonnull stop) {
            // Collect identifiers in a SDK-agnostic way using KVC to avoid hard dependencies
            @try {
                id contact = [event valueForKey:@"contact"]; // may exist for Add events
                if (contact) {
                    NSString *cid = nil;
                    @try { cid = [contact valueForKey:@"identifier"]; } @catch (...) { cid = nil; }
                    if (cid.length > 0) { [changedIds addObject:cid]; return; }
                }
            } @catch (...) {}
            @try {
                NSString *cid = [event valueForKey:@"contactIdentifier"]; // for Update/Delete events
                if (cid.length > 0) { [changedIds addObject:cid]; return; }
            } @catch (...) {}
            @try {
                NSArray *cids = [event valueForKey:@"contactIdentifiers"]; // for Link/Unlink
                if ([cids isKindOfClass:[NSArray class]]) {
                    for (id obj in cids) {
                        if ([obj isKindOfClass:[NSString class]] && [obj length] > 0) {
                            [changedIds addObject:(NSString *)obj];
                        }
                    }
                }
            } @catch (...) {}
        }];
        if (!ok || err) {
            // Fallback: compute fingerprint delta vs snapshot
            if (off == 0 || gCLU_LastDeltaItems == nil) {
                gCLU_LastDeltaItems = CLUComputeDeltaContacts(store, CLULoadSnapshot());
            }
            NSInteger end = MIN((NSInteger)gCLU_LastDeltaItems.count, off + lim);
            NSArray *page = (off < end) ? [gCLU_LastDeltaItems subarrayWithRange:NSMakeRange(off, end - off)] : @[];
            NSData *newToken = store.currentHistoryToken;
            NSString *nextSince = newToken != nil ? [newToken base64EncodedStringWithOptions:0] : @"";
            return @{ @"items": page, @"nextSince": nextSince ?: @"" };
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
    } else {
        // No change-history events — fallback to fingerprint delta snapshot
        if (off == 0 || gCLU_LastDeltaItems == nil) {
            gCLU_LastDeltaItems = CLUComputeDeltaContacts(store, CLULoadSnapshot());
        }
        NSInteger end = MIN((NSInteger)gCLU_LastDeltaItems.count, off + lim);
        NSArray *page = (off < end) ? [gCLU_LastDeltaItems subarrayWithRange:NSMakeRange(off, end - off)] : @[];
        [items addObjectsFromArray:page];
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
    // Rebuild snapshot after committing to advance baseline
    CNContactStore *store = [CNContactStore new];
    CLURebuildSnapshot(store);
    gCLU_LastDeltaItems = nil;
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
        BOOL ok = [self clu_enumerateChangeHistoryInStore:store
                                               startToken:startToken
                                              usingBlock:^(CNChangeHistoryEvent * _Nonnull event, BOOL * _Nonnull stop) {
            // Collect identifiers in a SDK-agnostic way using KVC to avoid hard dependencies
            @try {
                id contact = [event valueForKey:@"contact"]; // may exist for Add events
                if (contact) {
                    NSString *cid = nil;
                    @try { cid = [contact valueForKey:@"identifier"]; } @catch (...) { cid = nil; }
                    if (cid.length > 0) { [changedIds addObject:cid]; return; }
                }
            } @catch (...) {}
            @try {
                NSString *cid = [event valueForKey:@"contactIdentifier"]; // for Update/Delete events
                if (cid.length > 0) { [changedIds addObject:cid]; return; }
            } @catch (...) {}
            @try {
                NSArray *cids = [event valueForKey:@"contactIdentifiers"]; // for Link/Unlink
                if ([cids isKindOfClass:[NSArray class]]) {
                    for (id obj in cids) {
                        if ([obj isKindOfClass:[NSString class]] && [obj length] > 0) {
                            [changedIds addObject:(NSString *)obj];
                        }
                    }
                }
            } @catch (...) {}
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
