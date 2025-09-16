import Foundation

class ContactsLastUpdatedCache {
  private let key = "ContactsLastUpdatedCache.v1"
  private var map: [String: Double]

  init() {
    map = UserDefaults.standard.dictionary(forKey: key) as? [String: Double] ?? [:]
  }

  func getTimestamp(for id: String) -> Double? { map[id] }

  func setTimestamp(_ ts: Double, for id: String) {
    map[id] = ts
    UserDefaults.standard.set(map, forKey: key)
  }
}