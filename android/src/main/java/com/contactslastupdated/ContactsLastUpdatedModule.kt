package com.contactslastupdated

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import android.provider.ContactsContract
import android.database.Cursor
import android.net.Uri
import android.content.ContentResolver
import android.os.Build
import android.content.SharedPreferences
import android.content.Context
import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import java.util.LinkedHashMap

@Suppress("unused")

@ReactModule(name = ContactsLastUpdatedModule.NAME)
class ContactsLastUpdatedModule(reactContext: ReactApplicationContext) :
  NativeContactsLastUpdatedSpec(reactContext) {

  override fun getName(): String {
    return NAME
  }

  // Example method
  // See https://reactnative.dev/docs/native-modules-android
  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  // Data class for internal mapping
  data class PhoneEntry(
    val id: String?,
    val number: String
  )

  data class Contact(
    val id: String,
    val displayName: String,
    val phoneNumbers: List<PhoneEntry>,
    val lastUpdatedAt: Long?,
    val givenName: String? = null,
    val familyName: String? = null
  )

  data class SnapshotContact(
    val id: String,
    val displayName: String,
    val phoneNumbers: List<PhoneEntry>,
    val lastUpdatedAt: Long?,
    val givenName: String?,
    val familyName: String?
  )

  enum class ChangeType {
    CREATED,
    UPDATED,
    DELETED
  }

  data class PhoneNumberChanges(
    val created: List<String>,
    val updated: List<Pair<String, String>>,
    val deleted: List<String>
  )

  data class PreviousState(
    val displayName: String?,
    val givenName: String?,
    val familyName: String?,
    val phoneNumbers: List<String>
  )

  data class ContactDelta(
    val id: String,
    val displayName: String?,
    val givenName: String?,
    val familyName: String?,
    val phoneNumbers: List<String>,
    val lastUpdatedAt: Long?,
    val changeType: ChangeType,
    val phoneNumberChanges: PhoneNumberChanges,
    val previous: PreviousState?,
    val isDeleted: Boolean,
    val sortTimestamp: Long
  )

  override fun getAll(offset: Double, limit: Double): WritableArray {
    val off = offset.toInt().coerceAtLeast(0)
    val lim = limit.toInt().coerceAtLeast(0)
    if (lim <= 0) return Arguments.createArray()
    val contacts = queryContacts(off, lim, null)
    return contactsToWritableArray(contacts)
  }

  override fun getById(id: String): WritableMap? {
    if (id.isEmpty()) return null
    val contact = queryContactById(id) ?: return null
    return contactToWritableMap(contact)
  }

  override fun getUpdatedSince(
    since: String,
    offset: Double,
    limit: Double
  ): WritableMap {
    val delta = computeDelta(since.toLongOrNull() ?: 0L, offset, limit)
    val result = Arguments.createMap()
    result.putArray("items", deltasToWritableArray(delta.items))
    result.putString("nextSince", delta.nextSince)
    return result
  }

  // Persisted token helpers (store a small timestamp, not contacts)
  private val prefs: SharedPreferences by lazy {
    reactApplicationContext.getSharedPreferences("ContactsLastUpdatedPrefs", Context.MODE_PRIVATE)
  }

  override fun getPersistedSince(): String {
    return prefs.getLong("since", 0L).toString()
  }

  override fun getUpdatedFromPersisted(offset: Double, limit: Double): WritableMap {
    val delta = computeDelta(prefs.getLong("since", 0L), offset, limit)
    val map = Arguments.createMap()
    map.putArray("items", deltasToWritableArray(delta.items))
    map.putString("nextSince", delta.nextSince)
    return map
  }

  override fun commitPersisted(nextSince: String) {
    val v = nextSince.toLongOrNull() ?: return
    prefs.edit().putLong("since", v).apply()
    rebuildSnapshot()
  }

  private data class DeltaResult(
    val items: List<ContactDelta>,
    val nextSince: String
  )

  private fun computeDelta(sinceMs: Long, offset: Double, limit: Double): DeltaResult {
    val off = offset.toInt().coerceAtLeast(0)
    val lim = limit.toInt().coerceAtLeast(0)
    val nextSince = System.currentTimeMillis().toString()
    if (lim <= 0) {
      return DeltaResult(emptyList(), nextSince)
    }

    val snapshot = loadSnapshot()
    val updatedContacts = queryContactsForDelta(sinceMs, off + lim)
    val updatedIds = updatedContacts.map { it.id }.toSet()
    val updatedDeltas = updatedContacts.map { contact ->
      val previous = snapshot[contact.id]
      buildDelta(contact, previous, if (previous == null) ChangeType.CREATED else ChangeType.UPDATED, contact.lastUpdatedAt ?: System.currentTimeMillis())
    }

    val deletedCandidates = queryDeletedContacts(sinceMs, off + lim)
    val deletedDeltas = deletedCandidates
      .mapNotNull { deleted ->
        val previous = snapshot[deleted.contactId] ?: return@mapNotNull null
        // Skip if contact still present in updated list (was resurrected)
        if (updatedIds.contains(deleted.contactId)) return@mapNotNull null
        buildDelta(null, previous, ChangeType.DELETED, deleted.deletedAt)
      }

    val combined = (updatedDeltas + deletedDeltas)
      .sortedByDescending { it.sortTimestamp }

    val page = if (off >= combined.size) emptyList() else combined.drop(off).take(lim)
    return DeltaResult(page, nextSince)
  }

  private data class DeletedContact(
    val contactId: String,
    val deletedAt: Long
  )

  private fun queryContactsForDelta(sinceMs: Long, desiredCount: Int): List<Contact> {
    if (desiredCount <= 0) return emptyList()
    val filter = if (sinceMs > 0) sinceMs else null
    return queryContacts(0, desiredCount, filter)
  }

  private fun queryDeletedContacts(sinceMs: Long, desiredCount: Int): List<DeletedContact> {
    if (desiredCount <= 0 || sinceMs <= 0) return emptyList()
    val cr: ContentResolver = reactApplicationContext.contentResolver
    val uri: Uri = ContactsContract.DeletedContacts.CONTENT_URI
    val projection = arrayOf(
      ContactsContract.DeletedContacts.CONTACT_ID,
      ContactsContract.DeletedContacts.CONTACT_DELETED_TIMESTAMP
    )
    val selection = ContactsContract.DeletedContacts.CONTACT_DELETED_TIMESTAMP + " > ?"
    val selectionArgs = arrayOf(sinceMs.toString())
    val sortOrder = ContactsContract.DeletedContacts.CONTACT_DELETED_TIMESTAMP + " DESC"
    val results = ArrayList<DeletedContact>()
    val cursor = cr.query(uri, projection, selection, selectionArgs, sortOrder)
    cursor?.use { c ->
      var count = 0
      while (c.moveToNext() && count < desiredCount) {
        val contactId = c.getLong(c.getColumnIndexOrThrow(ContactsContract.DeletedContacts.CONTACT_ID)).toString()
        val deletedAt = c.getLong(c.getColumnIndexOrThrow(ContactsContract.DeletedContacts.CONTACT_DELETED_TIMESTAMP))
        results.add(DeletedContact(contactId, deletedAt))
        count++
      }
    }
    val unique = LinkedHashMap<String, DeletedContact>()
    for (entry in results) {
      if (!unique.containsKey(entry.contactId)) {
        unique[entry.contactId] = entry
      }
    }
    return unique.values.toList()
  }

  private fun buildDelta(
    current: Contact?,
    previous: SnapshotContact?,
    change: ChangeType,
    sortTimestamp: Long
  ): ContactDelta {
    val currentMap = current?.phoneNumbers?.associateBy { it.id }
    val previousMap = previous?.phoneNumbers?.associateBy { it.id }

    val createdNumbers = ArrayList<String>()
    val updatedNumbers = ArrayList<Pair<String, String>>()
    val deletedNumbers = ArrayList<String>()

    if (previousMap != null) {
      for ((_, entry) in previousMap) {
        val matching = if (entry.id != null) currentMap?.get(entry.id) else null
        if (matching == null) {
          deletedNumbers.add(entry.number)
        } else if (matching.number != entry.number) {
          updatedNumbers.add(Pair(entry.number, matching.number))
        }
      }
    }

    if (currentMap != null) {
      for ((id, entry) in currentMap) {
        val existed = if (id != null) previousMap?.containsKey(id) == true else previous?.phoneNumbers?.any { it.number == entry.number } == true
        if (!existed) {
          createdNumbers.add(entry.number)
        }
      }
    }

    val phoneNumbers = current?.phoneNumbers?.map { it.number } ?: emptyList()
    val previousPhones = previous?.phoneNumbers?.map { it.number } ?: emptyList()

    val previousState = if (previous != null) {
      PreviousState(previous.displayName, previous.givenName, previous.familyName, previousPhones)
    } else null

    val changeType = when {
      change == ChangeType.DELETED -> ChangeType.DELETED
      previous == null -> ChangeType.CREATED
      else -> ChangeType.UPDATED
    }

    return ContactDelta(
      id = current?.id ?: previous?.id.orEmpty(),
      displayName = current?.displayName ?: previous?.displayName,
      givenName = current?.givenName ?: previous?.givenName,
      familyName = current?.familyName ?: previous?.familyName,
      phoneNumbers = phoneNumbers,
      lastUpdatedAt = current?.lastUpdatedAt ?: previous?.lastUpdatedAt,
      changeType = changeType,
      phoneNumberChanges = PhoneNumberChanges(createdNumbers, updatedNumbers, deletedNumbers),
      previous = previousState,
      isDeleted = changeType == ChangeType.DELETED,
      sortTimestamp = sortTimestamp
    )
  }

  private fun queryContacts(offset: Int, limit: Int, sinceMs: Long?): List<Contact> {
    val cr: ContentResolver = reactApplicationContext.contentResolver
    val uri: Uri = ContactsContract.Contacts.CONTENT_URI
    val projection = arrayOf(
      ContactsContract.Contacts._ID,
      ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
      // Available since API 18; our minSdk is 24
      ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP,
      ContactsContract.Contacts.HAS_PHONE_NUMBER
    )

    val selection: String?
    val selectionArgs: Array<String>?
    if (sinceMs != null && sinceMs > 0) {
      selection = ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP + " > ?"
      selectionArgs = arrayOf(sinceMs.toString())
    } else {
      selection = null
      selectionArgs = null
    }

    val sortOrder = ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP + " DESC"
    val items = ArrayList<Contact>(limit)
    val cursor: Cursor? = cr.query(uri, projection, selection, selectionArgs, sortOrder)
    cursor?.use { c ->
      if (!c.moveToPosition(offset)) {
        return emptyList()
      }
      var count = 0
      do {
        val id = c.getLong(c.getColumnIndexOrThrow(ContactsContract.Contacts._ID)).toString()
        val name = c.getString(c.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)) ?: ""
        val hasPhone = c.getInt(c.getColumnIndexOrThrow(ContactsContract.Contacts.HAS_PHONE_NUMBER))
        val updatedIdx = c.getColumnIndex(ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP)
        val updatedAt = if (updatedIdx >= 0 && !c.isNull(updatedIdx)) c.getLong(updatedIdx) else null

        val phones = if (hasPhone > 0) getPhoneNumbersForContact(id) else emptyList()
        items.add(Contact(id, name, phones, updatedAt))
        count++
      } while (c.moveToNext() && count < limit)
    }
    return items
  }

  private fun queryContactById(contactId: String): Contact? {
    val cr: ContentResolver = reactApplicationContext.contentResolver
    val uri: Uri = ContactsContract.Contacts.CONTENT_URI
    val projection = arrayOf(
      ContactsContract.Contacts._ID,
      ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
      ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP,
      ContactsContract.Contacts.HAS_PHONE_NUMBER
    )
    val selection = ContactsContract.Contacts._ID + " = ?"
    val selectionArgs = arrayOf(contactId)
    val cursor = cr.query(uri, projection, selection, selectionArgs, null)
    cursor?.use { c ->
      if (c.moveToFirst()) {
        val id = c.getLong(c.getColumnIndexOrThrow(ContactsContract.Contacts._ID)).toString()
        val name = c.getString(c.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)) ?: ""
        val hasPhone = c.getInt(c.getColumnIndexOrThrow(ContactsContract.Contacts.HAS_PHONE_NUMBER))
        val updatedIdx = c.getColumnIndex(ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP)
        val updatedAt = if (updatedIdx >= 0 && !c.isNull(updatedIdx)) c.getLong(updatedIdx) else null
        val phones = if (hasPhone > 0) getPhoneNumbersForContact(id) else emptyList()
        return Contact(id, name, phones, updatedAt)
      }
    }
    return null
  }

  private fun getPhoneNumbersForContact(contactId: String): List<PhoneEntry> {
    val cr: ContentResolver = reactApplicationContext.contentResolver
    val phonesUri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
    val projection = arrayOf(
      ContactsContract.CommonDataKinds.Phone._ID,
      ContactsContract.CommonDataKinds.Phone.NUMBER
    )
    val selection = ContactsContract.CommonDataKinds.Phone.CONTACT_ID + " = ?"
    val selectionArgs = arrayOf(contactId)
    val numbers = ArrayList<PhoneEntry>()
    val cursor = cr.query(phonesUri, projection, selection, selectionArgs, null)
    cursor?.use { c ->
      while (c.moveToNext()) {
        val number = c.getString(c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER))
        if (!number.isNullOrEmpty()) {
          val idIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone._ID)
          val dataId = if (idIdx >= 0 && !c.isNull(idIdx)) c.getLong(idIdx).toString() else null
          numbers.add(PhoneEntry(dataId, number))
        }
      }
    }
    return numbers
  }

  private fun contactToWritableMap(contact: Contact): WritableMap {
    val map = Arguments.createMap()
    map.putString("id", contact.id)
    map.putString("displayName", contact.displayName)
    val phones = Arguments.createArray()
    for (p in contact.phoneNumbers) phones.pushString(p.number)
    map.putArray("phoneNumbers", phones)
    if (contact.givenName != null) map.putString("givenName", contact.givenName) else map.putNull("givenName")
    if (contact.familyName != null) map.putString("familyName", contact.familyName) else map.putNull("familyName")
    if (contact.lastUpdatedAt != null) map.putDouble("lastUpdatedAt", contact.lastUpdatedAt.toDouble()) else map.putNull("lastUpdatedAt")
    return map
  }

  private fun contactsToWritableArray(contacts: List<Contact>): WritableArray {
    val array = Arguments.createArray()
    for (c in contacts) {
      array.pushMap(contactToWritableMap(c))
    }
    return array
  }

  private fun deltasToWritableArray(deltas: List<ContactDelta>): WritableArray {
    val array = Arguments.createArray()
    for (delta in deltas) {
      val map = Arguments.createMap()
      map.putString("id", delta.id)
      map.putString("displayName", delta.displayName ?: "")
      val phones = Arguments.createArray()
      for (p in delta.phoneNumbers) phones.pushString(p)
      map.putArray("phoneNumbers", phones)
      map.putNull("givenName")
      map.putNull("familyName")
      if (delta.lastUpdatedAt != null) map.putDouble("lastUpdatedAt", delta.lastUpdatedAt.toDouble()) else map.putNull("lastUpdatedAt")
      map.putString("changeType", delta.changeType.name.lowercase())
      map.putBoolean("isDeleted", delta.isDeleted)

      val changes = Arguments.createMap()
      val createdArray = Arguments.createArray()
      delta.phoneNumberChanges.created.forEach { createdArray.pushString(it) }
      val deletedArray = Arguments.createArray()
      delta.phoneNumberChanges.deleted.forEach { deletedArray.pushString(it) }
      val updatedArray = Arguments.createArray()
      delta.phoneNumberChanges.updated.forEach { pair ->
        val updatedMap = Arguments.createMap()
        updatedMap.putString("previous", pair.first)
        updatedMap.putString("current", pair.second)
        updatedArray.pushMap(updatedMap)
      }
      changes.putArray("created", createdArray)
      changes.putArray("deleted", deletedArray)
      changes.putArray("updated", updatedArray)
      map.putMap("phoneNumberChanges", changes)

      if (delta.previous != null) {
        val prev = Arguments.createMap()
        if (delta.previous.displayName != null) prev.putString("displayName", delta.previous.displayName) else prev.putNull("displayName")
        if (delta.previous.givenName != null) prev.putString("givenName", delta.previous.givenName) else prev.putNull("givenName")
        if (delta.previous.familyName != null) prev.putString("familyName", delta.previous.familyName) else prev.putNull("familyName")
        val prevPhones = Arguments.createArray()
        delta.previous.phoneNumbers.forEach { prevPhones.pushString(it) }
        prev.putArray("phoneNumbers", prevPhones)
        map.putMap("previous", prev)
      } else {
        map.putNull("previous")
      }

      array.pushMap(map)
    }
    return array
  }

  private fun snapshotDir(): File {
    val dir = File(reactApplicationContext.filesDir, "ContactsLastUpdated")
    if (!dir.exists()) {
      dir.mkdirs()
    }
    return dir
  }

  private fun snapshotFile(): File = File(snapshotDir(), "snapshot.json")

  private fun loadSnapshot(): MutableMap<String, SnapshotContact> {
    val file = snapshotFile()
    if (!file.exists()) {
      rebuildSnapshot()
      if (!file.exists()) return mutableMapOf()
    }
    return try {
      val text = file.readText()
      if (text.isEmpty()) mutableMapOf() else {
        val root = JSONObject(text)
        val contactsJson = root.optJSONObject("contacts") ?: return mutableMapOf()
        val result = mutableMapOf<String, SnapshotContact>()
        val keys = contactsJson.keys()
        while (keys.hasNext()) {
          val id = keys.next()
          val obj = contactsJson.optJSONObject(id) ?: continue
          val displayName = obj.optString("displayName", "")
          val givenName = if (obj.has("givenName") && !obj.isNull("givenName")) obj.optString("givenName") else null
          val familyName = if (obj.has("familyName") && !obj.isNull("familyName")) obj.optString("familyName") else null
          val lastUpdatedAt = if (obj.has("lastUpdatedAt") && !obj.isNull("lastUpdatedAt")) obj.optLong("lastUpdatedAt") else null
          val phoneNumbersJson = obj.optJSONArray("phoneNumbers")
          val phones = mutableListOf<PhoneEntry>()
          if (phoneNumbersJson != null) {
            for (i in 0 until phoneNumbersJson.length()) {
              val pn = phoneNumbersJson.optJSONObject(i) ?: continue
              val pid = if (pn.has("id") && !pn.isNull("id")) pn.optString("id") else null
              val number = pn.optString("value", "")
              phones.add(PhoneEntry(pid, number))
            }
          }
          result[id] = SnapshotContact(id, displayName, phones, lastUpdatedAt, givenName, familyName)
        }
        result
      }
    } catch (_: Exception) {
      mutableMapOf()
    }
  }

  private fun saveSnapshot(snapshot: Map<String, SnapshotContact>) {
    try {
      val contactsObj = JSONObject()
      for ((id, contact) in snapshot) {
        val contactObj = JSONObject()
        contactObj.put("displayName", contact.displayName)
        contactObj.put("givenName", contact.givenName ?: JSONObject.NULL)
        contactObj.put("familyName", contact.familyName ?: JSONObject.NULL)
        contactObj.put("lastUpdatedAt", contact.lastUpdatedAt ?: JSONObject.NULL)
        val phoneArray = JSONArray()
        contact.phoneNumbers.forEach { entry ->
          val pn = JSONObject()
          pn.put("id", entry.id ?: JSONObject.NULL)
          pn.put("value", entry.number)
          phoneArray.put(pn)
        }
        contactObj.put("phoneNumbers", phoneArray)
        contactsObj.put(id, contactObj)
      }
      val root = JSONObject()
      root.put("contacts", contactsObj)
      snapshotFile().writeText(root.toString())
    } catch (_: Exception) {
      // best effort persistence
    }
  }

  private fun rebuildSnapshot() {
    val cr: ContentResolver = reactApplicationContext.contentResolver
    val uri: Uri = ContactsContract.Contacts.CONTENT_URI
    val projection = arrayOf(
      ContactsContract.Contacts._ID,
      ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
      ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP,
      ContactsContract.Contacts.HAS_PHONE_NUMBER
    )
    val snapshot = mutableMapOf<String, SnapshotContact>()
    val cursor = cr.query(uri, projection, null, null, null)
    cursor?.use { c ->
      while (c.moveToNext()) {
        val id = c.getLong(c.getColumnIndexOrThrow(ContactsContract.Contacts._ID)).toString()
        val name = c.getString(c.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)) ?: ""
        val hasPhone = c.getInt(c.getColumnIndexOrThrow(ContactsContract.Contacts.HAS_PHONE_NUMBER))
        val updatedIdx = c.getColumnIndex(ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP)
        val updatedAt = if (updatedIdx >= 0 && !c.isNull(updatedIdx)) c.getLong(updatedIdx) else null
        val phones = if (hasPhone > 0) getPhoneNumbersForContact(id) else emptyList()
        snapshot[id] = SnapshotContact(id, name, phones, updatedAt, null, null)
      }
    }
    saveSnapshot(snapshot)
  }

  companion object {
    const val NAME = "ContactsLastUpdated"
  }
}
