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

static NSString *CLUDisplayName(CNContact *c) {
    NSString *g = c.givenName ?: @"";
    NSString *f = c.familyName ?: @"";
    if (g.length > 0 && f.length > 0) return [NSString stringWithFormat:@"%@ %@", g, f];
    return g.length > 0 ? g : f;
}

static NSDictionary *CLUContactToContactDict(CNContact *c) {
    NSMutableArray *phones = [NSMutableArray array];
    for (CNLabeledValue<CNPhoneNumber *> *lv in c.phoneNumbers) {
        CNPhoneNumber *pn = lv.value;
        if (pn.stringValue) [phones addObject:pn.stringValue];
    }
    NSString *displayName = CLUDisplayName(c) ?: @"";
    id given = c.givenName ?: [NSNull null];
    id family = c.familyName ?: [NSNull null];
    if ([given isKindOfClass:[NSString class]] && [((NSString *)given) length] == 0) {
        given = [NSNull null];
    }
    if ([family isKindOfClass:[NSString class]] && [((NSString *)family) length] == 0) {
        family = [NSNull null];
    }
    return @{
        @"id": c.identifier ?: @"",
        @"displayName": displayName ?: @"",
        @"phoneNumbers": phones,
        @"givenName": given,
        @"familyName": family,
        @"lastUpdatedAt": [NSNull null],
    };
}

static NSString *CLUStringOrEmpty(NSString *s) {
    return s ?: @"";
}

static NSDictionary *CLUPhoneEntry(NSString *identifier, NSString *value) {
    NSString *val = CLUStringOrEmpty(value);
    NSString *norm = CLUNormalizePhone(val);
    NSString *pid = CLUStringOrEmpty(identifier);
    return @{ @"id": pid, @"value": val, @"normalized": norm ?: @"" };
}

static NSArray<NSDictionary *> *CLUPhoneEntriesFromContact(CNContact *c) {
    NSMutableArray<NSDictionary *> *phones = [NSMutableArray arrayWithCapacity:c.phoneNumbers.count];
    for (CNLabeledValue<CNPhoneNumber *> *lv in c.phoneNumbers) {
        CNPhoneNumber *pn = lv.value;
        if (!pn.stringValue) continue;
        NSString *identifier = nil;
        @try { identifier = lv.identifier; } @catch (...) { identifier = nil; }
        [phones addObject:CLUPhoneEntry(identifier, pn.stringValue)];
    }
    return phones;
}

static NSDictionary *CLUContactState(CNContact *c) {
    return @{
        @"id": CLUStringOrEmpty(c.identifier),
        @"displayName": CLUStringOrEmpty(CLUDisplayName(c)),
        @"givenName": CLUStringOrEmpty(c.givenName),
        @"familyName": CLUStringOrEmpty(c.familyName),
        @"phoneNumbers": CLUPhoneEntriesFromContact(c),
        @"fingerprint": @(CLUContactFingerprint(c)),
    };
}

static NSString *CLUIdentifierFromEntry(NSDictionary *entry) {
    id value = entry[@"id"];
    if (![value isKindOfClass:[NSString class]]) return nil;
    NSString *s = (NSString *)value;
    return s.length > 0 ? s : nil;
}

static NSString *CLUValueFromEntry(NSDictionary *entry) {
    id value = entry[@"value"];
    if (![value isKindOfClass:[NSString class]]) return @"";
    return (NSString *)value;
}

static NSString *CLUNormalizedFromEntry(NSDictionary *entry) {
    id value = entry[@"normalized"];
    if (![value isKindOfClass:[NSString class]]) return @"";
    return (NSString *)value;
}

static NSArray *CLUPhoneStringsFromEntries(NSArray *entries) {
    NSMutableArray *strings = [NSMutableArray arrayWithCapacity:entries.count];
    for (NSDictionary *entry in entries) {
        NSString *value = CLUValueFromEntry(entry);
        if (value.length > 0) [strings addObject:value];
    }
    return strings;
}

static NSDictionary *CLUComputePhoneChangesForEntries(NSArray *currentEntries, NSArray *previousEntries) {
    NSMutableDictionary<NSString *, NSDictionary *> *currentById = [NSMutableDictionary dictionary];
    NSMutableDictionary<NSString *, NSDictionary *> *previousById = [NSMutableDictionary dictionary];
    NSMutableArray<NSDictionary *> *currentNoId = [NSMutableArray array];
    NSMutableArray<NSDictionary *> *previousNoId = [NSMutableArray array];

    for (NSDictionary *entry in currentEntries) {
        NSString *identifier = CLUIdentifierFromEntry(entry);
        if (identifier) {
            currentById[identifier] = entry;
        } else {
            [currentNoId addObject:entry];
        }
    }

    for (NSDictionary *entry in previousEntries) {
        NSString *identifier = CLUIdentifierFromEntry(entry);
        if (identifier) {
            previousById[identifier] = entry;
        } else {
            [previousNoId addObject:entry];
        }
    }

    NSMutableArray *created = [NSMutableArray array];
    NSMutableArray *deleted = [NSMutableArray array];
    NSMutableArray *updated = [NSMutableArray array];
    NSMutableSet<NSString *> *matchedCurrentIds = [NSMutableSet set];

    [previousById enumerateKeysAndObjectsUsingBlock:^(NSString * _Nonnull identifier, NSDictionary * _Nonnull prevEntry, BOOL * _Nonnull stop) {
        NSDictionary *currEntry = currentById[identifier];
        if (!currEntry) {
            NSString *prevValue = CLUValueFromEntry(prevEntry);
            if (prevValue.length > 0) [deleted addObject:prevValue];
            return;
        }
        [matchedCurrentIds addObject:identifier];
        NSString *prevValue = CLUValueFromEntry(prevEntry);
        NSString *currValue = CLUValueFromEntry(currEntry);
        if (![prevValue isEqualToString:currValue]) {
            [updated addObject:@{ @"previous": prevValue ?: @"", @"current": currValue ?: @"" }];
        }
    }];

    NSMutableArray<NSDictionary *> *mutableCurrentNoId = [currentNoId mutableCopy];
    for (NSDictionary *prevEntry in previousNoId) {
        NSString *prevNorm = CLUNormalizedFromEntry(prevEntry);
        BOOL matched = NO;
        for (NSUInteger idx = 0; idx < mutableCurrentNoId.count; idx++) {
            NSDictionary *candidate = mutableCurrentNoId[idx];
            NSString *candidateNorm = CLUNormalizedFromEntry(candidate);
            if (prevNorm.length > 0 && [candidateNorm isEqualToString:prevNorm]) {
                [mutableCurrentNoId removeObjectAtIndex:idx];
                matched = YES;
                break;
            }
        }
        if (!matched) {
            NSString *prevValue = CLUValueFromEntry(prevEntry);
            if (prevValue.length > 0) [deleted addObject:prevValue];
        }
    }

    for (NSDictionary *entry in currentEntries) {
        NSString *identifier = CLUIdentifierFromEntry(entry);
        if (identifier) {
            if (!previousById[identifier] && ![matchedCurrentIds containsObject:identifier]) {
                NSString *value = CLUValueFromEntry(entry);
                if (value.length > 0) [created addObject:value];
            }
        }
    }

    for (NSDictionary *entry in mutableCurrentNoId) {
        NSString *value = CLUValueFromEntry(entry);
        if (value.length > 0) [created addObject:value];
    }

    return @{
        @"created": [created copy],
        @"deleted": [deleted copy],
        @"updated": [updated copy],
    };
}

static NSDictionary *CLUBuildPreviousSummary(NSDictionary *previous) {
    if (![previous isKindOfClass:[NSDictionary class]]) return nil;
    NSMutableDictionary *summary = [NSMutableDictionary dictionary];
    NSString *displayName = previous[@"displayName"];
    summary[@"displayName"] = displayName ?: @"";
    NSString *givenName = previous[@"givenName"];
    summary[@"givenName"] = (givenName.length > 0) ? givenName : [NSNull null];
    NSString *familyName = previous[@"familyName"];
    summary[@"familyName"] = (familyName.length > 0) ? familyName : [NSNull null];
    NSArray *prevPhones = previous[@"phoneNumbers"];
    summary[@"phoneNumbers"] = CLUPhoneStringsFromEntries([prevPhones isKindOfClass:[NSArray class]] ? prevPhones : @[]);
    return summary;
}

static NSDictionary *CLUBuildDeltaFromStates(NSDictionary *current, NSDictionary *previous, BOOL forceDeletion) {
    NSArray *currentEntries = ([current isKindOfClass:[NSDictionary class]]) ? current[@"phoneNumbers"] : @[];
    if (![currentEntries isKindOfClass:[NSArray class]]) currentEntries = @[];
    NSArray *previousEntries = ([previous isKindOfClass:[NSDictionary class]]) ? previous[@"phoneNumbers"] : @[];
    if (![previousEntries isKindOfClass:[NSArray class]]) previousEntries = @[];

    BOOL isDeleted = forceDeletion || current == nil;
    NSString *changeType = isDeleted ? @"deleted" : (previous == nil ? @"created" : @"updated");
    NSDictionary *phoneChanges = CLUComputePhoneChangesForEntries(currentEntries, previousEntries);
    NSArray *currentPhones = isDeleted ? @[] : CLUPhoneStringsFromEntries(currentEntries);

    NSString *identifier = nil;
    if ([current isKindOfClass:[NSDictionary class]]) identifier = current[@"id"];
    if (![identifier isKindOfClass:[NSString class]] || ((NSString *)identifier).length == 0) {
        id prevId = previous[@"id"];
        if ([prevId isKindOfClass:[NSString class]] && ((NSString *)prevId).length > 0) {
            identifier = prevId;
        } else {
            identifier = @"";
        }
    }

    NSString *displayName = nil;
    if (!isDeleted && [current isKindOfClass:[NSDictionary class]]) displayName = current[@"displayName"];
    if (![displayName isKindOfClass:[NSString class]] || ((NSString *)displayName).length == 0) {
        id prevName = previous[@"displayName"];
        if ([prevName isKindOfClass:[NSString class]] && ((NSString *)prevName).length > 0) displayName = prevName; else displayName = @"";
    }

    NSString *givenName = nil;
    if (!isDeleted && [current isKindOfClass:[NSDictionary class]]) givenName = current[@"givenName"];
    if (![givenName isKindOfClass:[NSString class]]) givenName = nil;
    if (!givenName || givenName.length == 0) {
        id prevGiven = previous[@"givenName"];
        if ([prevGiven isKindOfClass:[NSString class]] && ((NSString *)prevGiven).length > 0) givenName = prevGiven; else givenName = nil;
    }

    NSString *familyName = nil;
    if (!isDeleted && [current isKindOfClass:[NSDictionary class]]) familyName = current[@"familyName"];
    if (![familyName isKindOfClass:[NSString class]]) familyName = nil;
    if (!familyName || familyName.length == 0) {
        id prevFamily = previous[@"familyName"];
        if ([prevFamily isKindOfClass:[NSString class]] && ((NSString *)prevFamily).length > 0) familyName = prevFamily; else familyName = nil;
    }

    NSMutableDictionary *delta = [NSMutableDictionary dictionary];
    delta[@"id"] = [identifier isKindOfClass:[NSString class]] ? identifier : @"";
    delta[@"displayName"] = displayName ?: @"";
    delta[@"phoneNumbers"] = currentPhones ?: @[];
    delta[@"givenName"] = (givenName && givenName.length > 0) ? givenName : [NSNull null];
    delta[@"familyName"] = (familyName && familyName.length > 0) ? familyName : [NSNull null];
    delta[@"lastUpdatedAt"] = [NSNull null];
    delta[@"changeType"] = changeType;
    delta[@"isDeleted"] = @(isDeleted);
    delta[@"phoneNumberChanges"] = phoneChanges ?: @{};
    NSDictionary *prevSummary = CLUBuildPreviousSummary(previous);
    delta[@"previous"] = prevSummary ? prevSummary : [NSNull null];
    return delta;
}

static NSMutableDictionary<NSString *, NSDictionary *> *CLULoadSnapshot(void) {
    NSDictionary *d = [NSDictionary dictionaryWithContentsOfFile:CLUSnapshotPath()];
    if (![d isKindOfClass:[NSDictionary class]]) return [NSMutableDictionary new];

    BOOL needsUpgrade = NO;
    for (id value in d.allValues) {
        if ([value isKindOfClass:[NSNumber class]]) { needsUpgrade = YES; break; }
    }
    if (needsUpgrade) {
        CNContactStore *store = [CNContactStore new];
        CLURebuildSnapshot(store);
        NSDictionary *fresh = [NSDictionary dictionaryWithContentsOfFile:CLUSnapshotPath()];
        if ([fresh isKindOfClass:[NSDictionary class]]) return [fresh mutableCopy];
        return [NSMutableDictionary new];
    }
    return [d mutableCopy];
}

static void CLUSaveSnapshot(NSDictionary<NSString *, NSDictionary *> *snapshot) {
    if (!snapshot) return;
    [snapshot writeToFile:CLUSnapshotPath() atomically:YES];
}

static NSArray<NSDictionary *> *CLUComputeDeltaContacts(CNContactStore *store, NSDictionary<NSString *, NSDictionary *> *snapshot) {
    if (!snapshot || snapshot.count == 0 || ![snapshot isKindOfClass:[NSDictionary class]]) return @[];
    NSError *err = nil;
    NSArray *keys = @[CNContactIdentifierKey, CNContactGivenNameKey, CNContactFamilyNameKey, CNContactPhoneNumbersKey];
    CNContactFetchRequest *req = [[CNContactFetchRequest alloc] initWithKeysToFetch:keys];
    NSMutableDictionary<NSString *, NSDictionary *> *remaining = [snapshot mutableCopy];
    NSMutableArray<NSDictionary *> *deltas = [NSMutableArray array];
    BOOL ok = [store enumerateContactsWithFetchRequest:req error:&err usingBlock:^(CNContact * _Nonnull contact, BOOL * _Nonnull stop) {
        NSString *identifier = contact.identifier ?: @"";
        NSDictionary *currentState = CLUContactState(contact);
        id snapshotEntry = snapshot[identifier ?: @""];
        NSDictionary *previousState = [snapshotEntry isKindOfClass:[NSDictionary class]] ? snapshotEntry : nil;
        if (!previousState) {
            [deltas addObject:CLUBuildDeltaFromStates(currentState, nil, NO)];
        } else {
            NSNumber *prevFp = previousState[@"fingerprint"];
            NSNumber *currFp = currentState[@"fingerprint"];
            if (!prevFp || !currFp || ![prevFp isEqualToNumber:currFp]) {
                [deltas addObject:CLUBuildDeltaFromStates(currentState, previousState, NO)];
            }
        }
        [remaining removeObjectForKey:identifier ?: @""];
    }];
    if (!ok || err) return @[];
    for (NSString *identifier in remaining) {
        id snapshotEntry = remaining[identifier];
        if ([snapshotEntry isKindOfClass:[NSDictionary class]]) {
            [deltas addObject:CLUBuildDeltaFromStates(nil, snapshotEntry, YES)];
        }
    }
    return deltas;
}

static void CLURebuildSnapshot(CNContactStore *store) {
    NSError *err = nil;
    NSArray *keys = @[CNContactIdentifierKey, CNContactGivenNameKey, CNContactFamilyNameKey, CNContactPhoneNumbersKey];
    CNContactFetchRequest *req = [[CNContactFetchRequest alloc] initWithKeysToFetch:keys];
    NSMutableDictionary<NSString *, NSDictionary *> *snap = [NSMutableDictionary dictionary];
    [store enumerateContactsWithFetchRequest:req error:&err usingBlock:^(CNContact * _Nonnull contact, BOOL * _Nonnull stop) {
        NSDictionary *state = CLUContactState(contact);
        NSString *identifier = state[@"id"];
        if ([identifier isKindOfClass:[NSString class]] && ((NSString *)identifier).length > 0) {
            snap[identifier] = state;
        }
    }];
    if (!err) CLUSaveSnapshot(snap);
}

static void CLURegisterChangeEvent(NSMutableOrderedSet<NSString *> *changedIds,
                                   NSMutableDictionary<NSString *, NSNumber *> *deletedFlags,
                                   CNChangeHistoryEvent *event) {
    if (!event) return;
    BOOL markDeleted = NO;
    NSString *eventClass = NSStringFromClass([event class]) ?: @"";
    if ([eventClass containsString:@"DeleteContactEvent"]) {
        markDeleted = YES;
    }

    NSMutableArray<NSString *> *identifiers = [NSMutableArray array];

    @try {
        id contact = [event valueForKey:@"contact"];
        if (contact) {
            NSString *cid = nil;
            @try { cid = [contact valueForKey:@"identifier"]; } @catch (...) { cid = nil; }
            if ([cid isKindOfClass:[NSString class]] && ((NSString *)cid).length > 0) {
                [identifiers addObject:cid];
            }
        }
    } @catch (...) {}

    @try {
        NSString *cid = [event valueForKey:@"contactIdentifier"];
        if ([cid isKindOfClass:[NSString class]] && ((NSString *)cid).length > 0) {
            [identifiers addObject:cid];
        }
    } @catch (...) {}

    @try {
        NSArray *cids = [event valueForKey:@"contactIdentifiers"];
        if ([cids isKindOfClass:[NSArray class]]) {
            for (id obj in cids) {
                if ([obj isKindOfClass:[NSString class]] && [obj length] > 0) {
                    [identifiers addObject:(NSString *)obj];
                }
            }
        }
    } @catch (...) {}

    if (identifiers.count == 0) return;

    for (NSString *cid in identifiers) {
        [changedIds addObject:cid];
        deletedFlags[cid] = @(markDeleted);
    }
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

    NSMutableDictionary<NSString *, NSDictionary *> *snapshot = CLULoadSnapshot();

    NSMutableOrderedSet<NSString *> *changedIds = [NSMutableOrderedSet orderedSet];
    NSMutableDictionary<NSString *, NSNumber *> *deletedFlags = [NSMutableDictionary dictionary];
    NSError *err = nil;

    if (startToken) {
        BOOL ok = [self clu_enumerateChangeHistoryInStore:store
                                               startToken:startToken
                                              usingBlock:^(CNChangeHistoryEvent * _Nonnull event, BOOL * _Nonnull stop) {
            CLURegisterChangeEvent(changedIds, deletedFlags, event);
        }];
        if (!ok || err) {
            if (off == 0 || gCLU_LastDeltaItems == nil) {
                gCLU_LastDeltaItems = CLUComputeDeltaContacts(store, snapshot);
            }
            NSInteger end = MIN((NSInteger)gCLU_LastDeltaItems.count, off + lim);
            NSArray *page = (off < end) ? [gCLU_LastDeltaItems subarrayWithRange:NSMakeRange(off, end - off)] : @[];
            NSData *newToken = store.currentHistoryToken;
            NSString *fallbackNext = newToken != nil ? [newToken base64EncodedStringWithOptions:0] : @"";
            NSString *persisted = sinceStr ?: @"";
            if (fallbackNext.length == 0 || [fallbackNext isEqualToString:persisted]) {
                long long ms = (long long)([[NSDate date] timeIntervalSince1970] * 1000.0);
                fallbackNext = [NSString stringWithFormat:@"fp:%lld", ms];
            }
            return @{ @"items": page ?: @[], @"nextSince": fallbackNext ?: @"" };
        }
    }

    if (lim <= 0) {
        NSData *newToken = store.currentHistoryToken;
        NSString *nextSince = newToken != nil ? [newToken base64EncodedStringWithOptions:0] : @"";
        return @{ @"items": @[], @"nextSince": nextSince ?: @"" };
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
            NSMutableDictionary<NSString *, CNContact *> *contactsById = [NSMutableDictionary dictionaryWithCapacity:contacts.count];
            if (!fetchErr && contacts) {
                for (CNContact *contact in contacts) {
                    if (!contact.identifier) continue;
                    contactsById[contact.identifier] = contact;
                }
            }
            for (NSString *identifier in pageIds) {
                BOOL markedDeleted = [deletedFlags[identifier] boolValue];
                CNContact *contact = contactsById[identifier];
                NSDictionary *currentState = contact ? CLUContactState(contact) : nil;
                id snapshotEntry = snapshot[identifier];
                NSDictionary *previousState = [snapshotEntry isKindOfClass:[NSDictionary class]] ? snapshotEntry : nil;
                if (!currentState && !previousState) continue;
                NSDictionary *delta = CLUBuildDeltaFromStates(currentState, previousState, (BOOL)(markedDeleted || contact == nil));
                if (delta) [items addObject:delta];
            }
        }
    }

    if (items.count == 0) {
        if (off == 0 || gCLU_LastDeltaItems == nil) {
            gCLU_LastDeltaItems = CLUComputeDeltaContacts(store, snapshot);
        }
        NSInteger end = MIN((NSInteger)gCLU_LastDeltaItems.count, off + lim);
        NSArray *page = (off < end) ? [gCLU_LastDeltaItems subarrayWithRange:NSMakeRange(off, end - off)] : @[];
        [items addObjectsFromArray:page];
    }

    NSData *newToken = store.currentHistoryToken;
    NSString *nextSince = newToken != nil ? [newToken base64EncodedStringWithOptions:0] : @"";
    NSString *persisted = [[NSUserDefaults standardUserDefaults] stringForKey:kCLUPersistedSinceKey] ?: @"";
    if (nextSince.length == 0 || [nextSince isEqualToString:persisted]) {
        long long ms = (long long)([[NSDate date] timeIntervalSince1970] * 1000.0);
        nextSince = [NSString stringWithFormat:@"fp:%lld", ms];
    }
    return @{ @"items": items ?: @[], @"nextSince": nextSince ?: @"" };
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

        [results addObject:CLUContactToContactDict(contact)];
    }];

    if (!ok || err) {
        // On error, return empty list
        return @[];
    }
    return results;
}

- (NSDictionary *)getById:(NSString *)identifier
{
    if (identifier == nil || identifier.length == 0) {
        return nil;
    }
    CNContactStore *store = [CNContactStore new];
    NSArray *keys = @[CNContactIdentifierKey,
                      CNContactGivenNameKey,
                      CNContactFamilyNameKey,
                      CNContactPhoneNumbersKey];
    NSError *err = nil;
    CNContact *contact = [store unifiedContactWithIdentifier:identifier keysToFetch:keys error:&err];
    if (err || contact == nil) {
        return nil;
    }
    return CLUContactToContactDict(contact);
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
        if (startToken.length == 0) startToken = nil;
    }

    NSMutableDictionary<NSString *, NSDictionary *> *snapshot = CLULoadSnapshot();

    NSMutableOrderedSet<NSString *> *changedIds = [NSMutableOrderedSet orderedSet];
    NSMutableDictionary<NSString *, NSNumber *> *deletedFlags = [NSMutableDictionary dictionary];
    NSError *err = nil;

    if (startToken) {
        BOOL ok = [self clu_enumerateChangeHistoryInStore:store
                                               startToken:startToken
                                              usingBlock:^(CNChangeHistoryEvent * _Nonnull event, BOOL * _Nonnull stop) {
            CLURegisterChangeEvent(changedIds, deletedFlags, event);
        }];
        if (!ok || err) {
            if (off == 0 || gCLU_LastDeltaItems == nil) {
                gCLU_LastDeltaItems = CLUComputeDeltaContacts(store, snapshot);
            }
            NSInteger end = MIN((NSInteger)gCLU_LastDeltaItems.count, off + lim);
            NSArray *page = (off < end) ? [gCLU_LastDeltaItems subarrayWithRange:NSMakeRange(off, end - off)] : @[];
            NSData *newToken = store.currentHistoryToken;
            NSString *fallbackNext = newToken != nil ? [newToken base64EncodedStringWithOptions:0] : @"";
            if (fallbackNext.length == 0 || (since && [fallbackNext isEqualToString:since])) {
                long long ms = (long long)([[NSDate date] timeIntervalSince1970] * 1000.0);
                fallbackNext = [NSString stringWithFormat:@"fp:%lld", ms];
            }
            return @{ @"items": page ?: @[], @"nextSince": fallbackNext ?: @"" };
        }
    }

    if (lim <= 0) {
        NSData *newToken = store.currentHistoryToken;
        NSString *nextSince = newToken != nil ? [newToken base64EncodedStringWithOptions:0] : @"";
        if (nextSince.length == 0 || (since && [nextSince isEqualToString:since])) {
            long long ms = (long long)([[NSDate date] timeIntervalSince1970] * 1000.0);
            nextSince = [NSString stringWithFormat:@"fp:%lld", ms];
        }
        return @{ @"items": @[], @"nextSince": nextSince ?: @"" };
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
            NSMutableDictionary<NSString *, CNContact *> *contactsById = [NSMutableDictionary dictionaryWithCapacity:contacts.count];
            if (!fetchErr && contacts) {
                for (CNContact *contact in contacts) {
                    if (!contact.identifier) continue;
                    contactsById[contact.identifier] = contact;
                }
            }
            for (NSString *identifier in pageIds) {
                BOOL markedDeleted = [deletedFlags[identifier] boolValue];
                CNContact *contact = contactsById[identifier];
                NSDictionary *currentState = contact ? CLUContactState(contact) : nil;
                id snapshotEntry = snapshot[identifier];
                NSDictionary *previousState = [snapshotEntry isKindOfClass:[NSDictionary class]] ? snapshotEntry : nil;
                if (!currentState && !previousState) continue;
                NSDictionary *delta = CLUBuildDeltaFromStates(currentState, previousState, (BOOL)(markedDeleted || contact == nil));
                if (delta) [items addObject:delta];
            }
        }
    }

    if (items.count == 0) {
        if (off == 0 || gCLU_LastDeltaItems == nil) {
            gCLU_LastDeltaItems = CLUComputeDeltaContacts(store, snapshot);
        }
        NSInteger end = MIN((NSInteger)gCLU_LastDeltaItems.count, off + lim);
        NSArray *page = (off < end) ? [gCLU_LastDeltaItems subarrayWithRange:NSMakeRange(off, end - off)] : @[];
        [items addObjectsFromArray:page];
    }

    NSData *newToken = store.currentHistoryToken;
    NSString *nextSince = newToken != nil ? [newToken base64EncodedStringWithOptions:0] : @"";
    if (nextSince.length == 0 || (since && [nextSince isEqualToString:since])) {
        long long ms = (long long)([[NSDate date] timeIntervalSince1970] * 1000.0);
        nextSince = [NSString stringWithFormat:@"fp:%lld", ms];
    }
    return @{ @"items": items ?: @[], @"nextSince": nextSince ?: @"" };
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeContactsLastUpdatedSpecJSI>(params);
}

@end
