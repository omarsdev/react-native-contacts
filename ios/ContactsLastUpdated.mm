#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ContactsLastUpdated, NSObject)
RCT_EXTERN_METHOD(hasPermission:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getContactsSortedByLastUpdated:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end