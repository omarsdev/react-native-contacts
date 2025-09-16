package com.contactsupdated

import android.Manifest
import android.content.pm.PackageManager
import android.database.Cursor
import android.provider.ContactsContract
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = "ContactsLastUpdated")
class ContactsLastUpdatedModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ContactsLastUpdated"

  @ReactMethod
  fun hasPermission(promise: Promise) {
    val granted = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
    promise.resolve(granted)
  }

  @ReactMethod
  fun requestPermission(promise: Promise) {
    // Delegate permission request to JS (PermissionsAndroid).
    // Return current state for convenience.
    val granted = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
    promise.resolve(if (granted) "granted" else "denied")
  }

  @ReactMethod
  fun getContactsSortedByLastUpdated(options: ReadableMap?, promise: Promise) {
    try {
      val hasPerm = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
      if (!hasPerm) { promise.reject("E_NO_PERMISSION", "READ_CONTACTS not granted"); return }

      val includePhones = options?.getMap("include")?.getBoolean("phones") ?: true
      val includeEmails = options?.getMap("include")?.getBoolean("emails") ?: true

      val projection = arrayOf(
        ContactsContract.Contacts._ID,
        ContactsContract.Contacts.LOOKUP_KEY,
        ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
        ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP // Android-only
      )

      val cursor = reactContext.contentResolver.query(
        ContactsContract.Contacts.CONTENT_URI,
        projection,
        null,
        null,
        ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP + " DESC"
      )

      val result = Arguments.createArray()

      cursor?.use {
        val idIdx = it.getColumnIndexOrThrow(ContactsContract.Contacts._ID)
        val nameIdx = it.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)
        val tsIdx = it.getColumnIndex(ContactsContract.Contacts.CONTACT_LAST_UPDATED_TIMESTAMP)

        while (it.moveToNext()) {
          val contactId = it.getString(idIdx)
          val name = it.getString(nameIdx) ?: ""
          val ts = if (tsIdx >= 0) it.getLong(tsIdx) else 0L

          val contactMap = Arguments.createMap()
          contactMap.putString("id", contactId)
          contactMap.putString("displayName", name)
          contactMap.putDouble("lastUpdated", if (ts > 0) ts.toDouble() else Double.NaN) // JS will coerce to number or null

          if (includePhones) {
            contactMap.putArray("phones", getPhones(contactId))
          } else contactMap.putArray("phones", Arguments.createArray())

          if (includeEmails) {
            contactMap.putArray("emails", getEmails(contactId))
          } else contactMap.putArray("emails", Arguments.createArray())

          result.pushMap(contactMap)
        }
      }

      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("E_QUERY", e.message, e)
    }
  }

  private fun getPhones(contactId: String): WritableArray {
    val arr = Arguments.createArray()
    val phonesCursor: Cursor? = reactContext.contentResolver.query(
      ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
      arrayOf(
        ContactsContract.CommonDataKinds.Phone.NUMBER,
        ContactsContract.CommonDataKinds.Phone.TYPE,
        ContactsContract.CommonDataKinds.Phone.LABEL,
        ContactsContract.CommonDataKinds.Phone.CONTACT_ID
      ),
      ContactsContract.CommonDataKinds.Phone.CONTACT_ID + " = ?",
      arrayOf(contactId),
      null
    )

    phonesCursor?.use { pc ->
      val numIdx = pc.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)
      val typeIdx = pc.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.TYPE)
      val labelIdx = pc.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.LABEL)
      while (pc.moveToNext()) {
        val map = Arguments.createMap()
        map.putString("number", pc.getString(numIdx))
        val type = pc.getInt(typeIdx)
        val label = pc.getString(labelIdx)
        map.putString("label", label ?: typeToLabel(type))
        arr.pushMap(map)
      }
    }
    return arr
  }

  private fun typeToLabel(type: Int): String {
    return when (type) {
      ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE -> "mobile"
      ContactsContract.CommonDataKinds.Phone.TYPE_HOME -> "home"
      ContactsContract.CommonDataKinds.Phone.TYPE_WORK -> "work"
      else -> "other"
    }
  }

  private fun getEmails(contactId: String): WritableArray {
    val arr = Arguments.createArray()
    val c = reactContext.contentResolver.query(
      ContactsContract.CommonDataKinds.Email.CONTENT_URI,
      arrayOf(
        ContactsContract.CommonDataKinds.Email.ADDRESS,
        ContactsContract.CommonDataKinds.Email.TYPE,
        ContactsContract.CommonDataKinds.Email.LABEL
      ),
      ContactsContract.CommonDataKinds.Email.CONTACT_ID + " = ?",
      arrayOf(contactId),
      null
    )
    c?.use { ec ->
      val addrIdx = ec.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.ADDRESS)
      val typeIdx = ec.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.TYPE)
      val labelIdx = ec.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.LABEL)
      while (ec.moveToNext()) {
        val map = Arguments.createMap()
        map.putString("address", ec.getString(addrIdx))
        val type = ec.getInt(typeIdx)
        val label = ec.getString(labelIdx)
        map.putString("label", label ?: when (type) {
          ContactsContract.CommonDataKinds.Email.TYPE_HOME -> "home"
          ContactsContract.CommonDataKinds.Email.TYPE_WORK -> "work"
          else -> "other"
        })
        arr.pushMap(map)
      }
    }
    return arr
  }
}