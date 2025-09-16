import Foundation
#if canImport(React)
import React
#endif

#if !canImport(React)
public typealias RCTPromiseResolveBlock = (_ result: Any?) -> Void
public typealias RCTPromiseRejectBlock = (_ code: String?, _ message: String?, _ error: Error?) -> Void
#endif

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
