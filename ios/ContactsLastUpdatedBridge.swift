import Foundation
import Contacts
import React

@objc(ContactsLastUpdated)
class ContactsLastUpdated: NSObject {

  private let store = CNContactStore()
  private let cache = ContactsLastUpdatedCache()

  @objc
  func hasPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let status = CNContactStore.authorizationStatus(for: .contacts)
    resolve(status == .authorized)
  }

  @objc
  func requestPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    store.requestAccess(for: .contacts) { granted, _ in
      resolve(granted ? "granted" : "denied")
    }
  }

  @objc
  func getContactsSortedByLastUpdated(_ options: NSDictionary?,
                                      resolver resolve: @escaping RCTPromiseResolveBlock,
                                      rejecter reject: @escaping RCTPromiseRejectBlock) {

    let iosMode = (options?["iosMode"] as? String) ?? "alpha"
    let include = options?["include"] as? NSDictionary
    let includePhones = include?["phones"] as? Bool ?? true
    let includeEmails = include?["emails"] as? Bool ?? true

    let keys: [CNKeyDescriptor] = [
      CNContactIdentifierKey as CNKeyDescriptor,
      CNContactFormatter.descriptorForRequiredKeys(for: .fullName),
      CNContactPhoneNumbersKey as CNKeyDescriptor,
      CNContactEmailAddressesKey as CNKeyDescriptor
    ]

    let request = CNContactFetchRequest(keysToFetch: keys)
    var contacts: [[String: Any]] = []

    do {
      try store.enumerateContacts(with: request) { contact, _ in
        var dict: [String: Any] = [
          "id": contact.identifier,
          "displayName": CNContactFormatter.string(from: contact, style: .fullName) ?? ""
        ]

        if includePhones {
          let phones = contact.phoneNumbers.map {
            ["label": $0.label.flatMap { CNLabeledValue<CNPhoneNumber>.localizedString(forLabel: $0) } ?? "other",
             "number": $0.value.stringValue]
          }
          dict["phones"] = phones
        } else { dict["phones"] = [] }

        if includeEmails {
          let emails = contact.emailAddresses.map {
            ["label": $0.label.flatMap { CNLabeledValue<NSString>.localizedString(forLabel: $0) } ?? "other",
             "address": String($0.value)]
          }
          dict["emails"] = emails
        } else { dict["emails"] = [] }

        let lastUpdated: Double?
        switch iosMode {
          case "cache":
            // Read or seed last-seen timestamp (now) if missing
            let ts = cache.getTimestamp(for: contact.identifier) ?? {
              let now = Date().timeIntervalSince1970 * 1000
              cache.setTimestamp(now, for: contact.identifier)
              return now
            }()
            lastUpdated = ts
          default:
            lastUpdated = nil
        }

        dict["lastUpdated"] = lastUpdated as Any
        contacts.append(dict)
      }

      if iosMode == "alpha" {
        contacts.sort { ($0["displayName"] as? String ?? "") < ($1["displayName"] as? String ?? "") }
      } else {
        contacts.sort {
          let a = ($0["lastUpdated"] as? Double) ?? 0
          let b = ($1["lastUpdated"] as? Double) ?? 0
          return a > b
        }
      }

      resolve(contacts)
    } catch {
      reject("E_QUERY", error.localizedDescription, error)
    }
  }

  override init() {
    super.init()
    NotificationCenter.default.addObserver(self,
      selector: #selector(handleContactsChanged),
      name: .CNContactStoreDidChange,
      object: nil
    )
  }

  @objc private func handleContactsChanged() {
    // When contacts change, stamp all identifiers we can read now as “touched”
    let keys: [CNKeyDescriptor] = [CNContactIdentifierKey as CNKeyDescriptor]
    let req = CNContactFetchRequest(keysToFetch: keys)
    do {
      try store.enumerateContacts(with: req) { contact, _ in
        self.cache.setTimestamp(Date().timeIntervalSince1970 * 1000, for: contact.identifier)
      }
    } catch {
      // ignore
    }
  }
}
