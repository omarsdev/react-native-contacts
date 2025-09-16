/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Contact,
  GetOptions,
  getContactsSortedByLastUpdated,
  hasPermission,
  requestPermission,
} from 'react-native-contacts-last-updated';

type FilterState = {
  mode: GetOptions['iosMode'];
  includePhones: boolean;
  includeEmails: boolean;
};

const INITIAL_FILTERS: FilterState = {
  mode: Platform.OS === 'ios' ? 'cache' : undefined,
  includePhones: true,
  includeEmails: true,
};

function App(): React.JSX.Element {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo<GetOptions>(() => ({
    iosMode: filters.mode,
    include: {
      phones: filters.includePhones,
      emails: filters.includeEmails,
    },
  }), [filters.includeEmails, filters.includePhones, filters.mode]);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const permitted = await hasPermission();
      if (!permitted) {
        const status = await requestPermission();
        if (status !== 'granted') {
          setError('Permission denied. Enable Contacts permission to continue.');
          setContacts([]);
          return;
        }
      }

      const result = await getContactsSortedByLastUpdated(options);
      setContacts(result);
    } catch (err) {
      console.warn('Failed to load contacts', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [options]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const togglePhones = useCallback(() => {
    setFilters(prev => ({...prev, includePhones: !prev.includePhones}));
  }, []);

  const toggleEmails = useCallback(() => {
    setFilters(prev => ({...prev, includeEmails: !prev.includeEmails}));
  }, []);

  const changeMode = useCallback(() => {
    setFilters(prev => ({
      ...prev,
      mode: prev.mode === 'cache' ? 'alpha' : 'cache',
    }));
  }, []);

  const renderContact = useCallback(({item}: {item: Contact}) => {
    return (
      <View style={styles.card}>
        <Text style={styles.name}>{item.displayName || 'Unnamed contact'}</Text>
        {filters.includePhones && item.phones.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Phones</Text>
            {item.phones.map(phone => (
              <Text key={`${item.id}-${phone.number}`} style={styles.row}>
                {phone.label ?? 'Other'}: {phone.number}
              </Text>
            ))}
          </View>
        )}
        {filters.includeEmails && item.emails.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Emails</Text>
            {item.emails.map(email => (
              <Text key={`${item.id}-${email.address}`} style={styles.row}>
                {email.label ?? 'Other'}: {email.address}
              </Text>
            ))}
          </View>
        )}
        {item.lastUpdated != null && (
          <Text style={styles.meta}>
            Last updated: {new Date(item.lastUpdated).toLocaleString()}
          </Text>
        )}
      </View>
    );
  }, [filters.includeEmails, filters.includePhones]);

  const handleRefresh = useCallback(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    loadContacts();
  }, [filters, loadContacts]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Contacts Last Updated</Text>
        <Text style={styles.subtitle}>
          Mode: {filters.mode ?? 'alpha'} · Phones: {filters.includePhones ? '✓' : '✗'} · Emails: {filters.includeEmails ? '✓' : '✗'}
        </Text>
        <View style={styles.actions}>
          <Pressable style={styles.button} onPress={changeMode}>
            <Text style={styles.buttonText}>
              Switch to {filters.mode === 'cache' ? 'Alpha' : 'Cache'} mode
            </Text>
          </Pressable>
          <Pressable style={styles.button} onPress={togglePhones}>
            <Text style={styles.buttonText}>
              {filters.includePhones ? 'Hide' : 'Show'} phones
            </Text>
          </Pressable>
          <Pressable style={styles.button} onPress={toggleEmails}>
            <Text style={styles.buttonText}>
              {filters.includeEmails ? 'Hide' : 'Show'} emails
            </Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={handleRefresh}>
            <Text style={styles.primaryButtonText}>Refresh</Text>
          </Pressable>
        </View>
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0066cc" />
        </View>
      )}

      {!loading && error && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && !error && (
        <FlatList
          data={contacts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderContact}
          ListEmptyComponent={
            <Text style={styles.empty}>No contacts found.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#101418',
  },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#19202a',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#a3adbd',
    marginTop: 4,
  },
  actions: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#26303d',
  },
  buttonText: {
    color: '#f0f4ff',
    fontSize: 13,
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2d74ff',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#ff7b7b',
    fontSize: 16,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: {width: 0, height: 4},
    shadowRadius: 12,
    elevation: 3,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  section: {
    marginTop: 8,
  },
  sectionHeader: {
    fontWeight: '600',
    marginBottom: 4,
  },
  row: {
    fontSize: 14,
    color: '#3a4756',
  },
  meta: {
    marginTop: 12,
    fontSize: 12,
    color: '#74808f',
  },
  empty: {
    textAlign: 'center',
    color: '#74808f',
    marginTop: 32,
  },
});

export default App;
