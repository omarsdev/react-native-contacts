import Foundation
import React

@objc(ContactsLastUpdatedSpec)
protocol ContactsLastUpdatedSpec: RCTTurboModule {
  func hasPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock)
  func requestPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock)
  func getContactsSortedByLastUpdated(_ options: NSDictionary?,
                                      resolver resolve: @escaping RCTPromiseResolveBlock,
                                      rejecter reject: @escaping RCTPromiseRejectBlock)
}

extension ContactsLastUpdatedSpec {
  static func moduleName() -> String! { "ContactsLastUpdated" }
}
