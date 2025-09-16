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
  data class Contact(
    val id: String,
    val displayName: String,
    val phoneNumbers: List<String>,
    val lastUpdatedAt: Long?
  )

  override fun getAll(offset: Double, limit: Double): WritableArray {
    val off = offset.toInt().coerceAtLeast(0)
    val lim = limit.toInt().coerceAtLeast(0)
    if (lim <= 0) return Arguments.createArray()
    val contacts = queryContacts(off, lim, null)
    return contactsToWritableArray(contacts)
  }

  override fun getUpdatedSince(
    since: String,
    offset: Double,
    limit: Double
  ): WritableMap {
    val off = offset.toInt().coerceAtLeast(0)
    val lim = limit.toInt().coerceAtLeast(0)
    if (lim <= 0) {
      val map = Arguments.createMap()
      map.putArray("items", Arguments.createArray())
      map.putString("nextSince", System.currentTimeMillis().toString())
      return map
    }
    val sinceMs = since.toLongOrNull() ?: 0L
    val contacts = queryContacts(off, lim, sinceMs)
    val result = Arguments.createMap()
    result.putArray("items", contactsToWritableArray(contacts))
    // Use current time as next checkpoint token
    result.putString("nextSince", System.currentTimeMillis().toString())
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
    val off = offset.toInt().coerceAtLeast(0)
    val lim = limit.toInt().coerceAtLeast(0)
    val start = prefs.getLong("since", 0L)
    val contacts = if (lim > 0) queryContacts(off, lim, start) else emptyList()
    val map = Arguments.createMap()
    map.putArray("items", contactsToWritableArray(contacts))
    map.putString("nextSince", System.currentTimeMillis().toString())
    return map
  }

  override fun commitPersisted(nextSince: String) {
    val v = nextSince.toLongOrNull() ?: return
    prefs.edit().putLong("since", v).apply()
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

  private fun getPhoneNumbersForContact(contactId: String): List<String> {
    val cr: ContentResolver = reactApplicationContext.contentResolver
    val phonesUri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
    val projection = arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER)
    val selection = ContactsContract.CommonDataKinds.Phone.CONTACT_ID + " = ?"
    val selectionArgs = arrayOf(contactId)
    val numbers = ArrayList<String>()
    val cursor = cr.query(phonesUri, projection, selection, selectionArgs, null)
    cursor?.use { c ->
      while (c.moveToNext()) {
        val number = c.getString(c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER))
        if (!number.isNullOrEmpty()) numbers.add(number)
      }
    }
    return numbers
  }

  private fun contactsToWritableArray(contacts: List<Contact>): WritableArray {
    val array = Arguments.createArray()
    for (c in contacts) {
      val map = Arguments.createMap()
      map.putString("id", c.id)
      map.putString("displayName", c.displayName)
      val phones = Arguments.createArray()
      for (p in c.phoneNumbers) phones.pushString(p)
      map.putArray("phoneNumbers", phones)
      map.putNull("givenName")
      map.putNull("familyName")
      if (c.lastUpdatedAt != null) map.putDouble("lastUpdatedAt", c.lastUpdatedAt.toDouble()) else map.putNull("lastUpdatedAt")
      array.pushMap(map)
    }
    return array
  }

  companion object {
    const val NAME = "ContactsLastUpdated"
  }
}
