import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  StatusBar,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {
  commitPersisted,
  getAll,
  getById,
  getUpdatedFromPersistedPaged,
  type Contact,
  type ContactChange,
} from '@omarsdev/react-native-contacts';

import { createStyles, type Theme } from '../styles';
import {
  ChangeRow,
  ContactRow,
  ControlPanel,
  InfoPanel,
  LookupPanel,
  LogViewer,
} from '../components';

const PAGE_FETCH_LIMIT = 300;
const FULL_BOOK_PAGE_SIZE = 500;

type ListItem = Contact | ContactChange;

type DeltaTally = {
  created: number;
  updated: number;
  deleted: number;
};

const ContactsDemoScreen = () => {
  const systemTheme = useColorScheme();
  const theme: Theme = systemTheme === 'dark' ? 'dark' : 'light';
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const [granted, setGranted] = React.useState<boolean>(Platform.OS === 'ios');
  const [loading, setLoading] = React.useState(false);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [changes, setChanges] = React.useState<ContactChange[]>([]);
  const [since, setSince] = React.useState('');
  const [deltaStatus, setDeltaStatus] = React.useState('No delta fetched yet');
  const [log, setLog] = React.useState('');
  const [lookupId, setLookupId] = React.useState('');
  const [lookupResult, setLookupResult] = React.useState<Contact | null>(null);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [pageOffset, setPageOffset] = React.useState(0);

  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const requestPermission = async () => {
      const res = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS
      );
      setGranted(res === PermissionsAndroid.RESULTS.GRANTED);
    };
    requestPermission();
  }, []);

  const appendLog = React.useCallback((message: string) => {
    setLog((prev) => `${new Date().toISOString()} ${message}\n${prev}`);
  }, []);

  const fetchCompleteBook = React.useCallback(async () => {
    if (!granted) {
      appendLog('Permission not granted');
      return;
    }
    setLoading(true);
    setChanges([]);
    setLookupResult(null);
    const started = Date.now();
    try {
      const all = await getAll({ pageSize: FULL_BOOK_PAGE_SIZE });
      setContacts(all);
      setPageOffset(0);
      appendLog(
        `Fetched entire contact list (${all.length}) in ${Date.now() - started}ms`
      );
    } catch (error: any) {
      appendLog(`Error: ${error?.message || String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [appendLog, granted]);

  const fetchNextPage = React.useCallback(async () => {
    if (!granted) {
      appendLog('Permission not granted');
      return;
    }
    setLoading(true);
    setChanges([]);
    setLookupResult(null);
    const started = Date.now();
    const currentOffset = pageOffset;
    try {
      const page = await getAll({
        offset: currentOffset,
        limit: PAGE_FETCH_LIMIT,
      });
      appendLog(
        `Fetched page offset=${currentOffset} size=${page.length} in ${Date.now() - started}ms`
      );
      setContacts((prev) => (currentOffset === 0 ? page : [...prev, ...page]));
      setPageOffset(
        page.length < PAGE_FETCH_LIMIT ? 0 : currentOffset + page.length
      );
    } catch (error: any) {
      appendLog(`Error: ${error?.message || String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [appendLog, granted, pageOffset]);

  const fetchDelta = React.useCallback(async () => {
    if (!granted) {
      appendLog('Permission not granted');
      return;
    }
    setLoading(true);
    setDeltaStatus('Fetching delta…');
    setContacts([]);
    try {
      let offset = 0;
      let sessionToken = '';
      const collected: ContactChange[] = [];
      const started = Date.now();
      for (;;) {
        const response = await getUpdatedFromPersistedPaged(
          offset,
          PAGE_FETCH_LIMIT
        );
        const items = response.items ?? [];
        if (!sessionToken) sessionToken = response.nextSince || '';
        appendLog(
          `Fetched delta page: offset=${offset} size=${items.length} session=${sessionToken}`
        );
        if (items.length === 0) break;
        collected.push(...items);
        offset += items.length;
        if (items.length < PAGE_FETCH_LIMIT) break;
      }
      setChanges(collected);
      const summary = collected.reduce<DeltaTally>(
        (acc, item) => ({
          ...acc,
          [item.changeType]: acc[item.changeType] + 1,
        }),
        { created: 0, updated: 0, deleted: 0 }
      );
      if (sessionToken) {
        console.log(sessionToken);
        commitPersisted(sessionToken);
        setSince(sessionToken);
      }
      appendLog(
        `Completed delta fetch. Items=${collected.length} (created=${summary.created}, updated=${summary.updated}, deleted=${summary.deleted}) committedSince=${sessionToken} in ${Date.now() - started}ms`
      );
      setDeltaStatus(
        `Delta: ${collected.length} (created ${summary.created}, updated ${summary.updated}, deleted ${summary.deleted})`
      );
    } catch (error: any) {
      appendLog(`Error: ${error?.message || String(error)}`);
      setDeltaStatus('Error while fetching delta');
    } finally {
      setLoading(false);
    }
  }, [appendLog, granted]);

  const resetUi = React.useCallback(() => {
    setContacts([]);
    setChanges([]);
    setSince('');
    setLookupResult(null);
    setLookupError(null);
    setLookupId('');
    setPageOffset(0);
    setDeltaStatus('No delta fetched yet');
    appendLog('State reset; since cleared');
  }, [appendLog]);

  const lookupById = React.useCallback(() => {
    if (!granted) {
      appendLog('Permission not granted');
      return;
    }
    const trimmed = lookupId.trim();
    if (trimmed.length === 0) {
      setLookupError('Enter a contact identifier');
      setLookupResult(null);
      return;
    }
    try {
      const result = getById(trimmed);
      if (result) {
        setLookupResult(result);
        setLookupError(null);
        appendLog(`Lookup success for ${trimmed}`);
      } else {
        setLookupResult(null);
        setLookupError('Contact not found');
        appendLog(`Lookup miss for ${trimmed}`);
      }
    } catch (error: any) {
      const message = error?.message || String(error);
      setLookupResult(null);
      setLookupError(message);
      appendLog(`Lookup error: ${message}`);
    }
  }, [appendLog, granted, lookupId]);

  const listLabel = contacts.length > 0 ? 'All Contacts' : 'Delta Contacts';
  const listData = React.useMemo<ListItem[]>(
    () => (contacts.length > 0 ? contacts : changes),
    [contacts, changes]
  );

  const renderItem = React.useCallback(
    ({ item }: { item: ListItem }) =>
      'changeType' in item ? (
        <ChangeRow change={item} styles={styles} />
      ) : (
        <ContactRow contact={item} styles={styles} />
      ),
    [styles]
  );

  const keyExtractor = React.useCallback(
    (item: ListItem, index: number) =>
      'changeType' in item
        ? `${item.id}:${item.changeType}:${item.isDeleted}:${index}`
        : `${item.id}:${index}`,
    []
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <ControlPanel
        styles={styles}
        loading={loading}
        onFetchPage={fetchNextPage}
        onFetchAll={fetchCompleteBook}
        onFetchDelta={fetchDelta}
        onReset={resetUi}
      />
      <InfoPanel
        styles={styles}
        deltaStatus={deltaStatus}
        granted={granted}
        loading={loading}
        since={since}
        listLabel={listLabel}
        listCount={listData.length}
      />
      <LookupPanel
        styles={styles}
        theme={theme}
        lookupId={lookupId}
        loading={loading}
        error={lookupError}
        result={lookupResult}
        onChangeId={setLookupId}
        onLookup={lookupById}
      />
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator
            size="small"
            color={theme === 'dark' ? '#fff' : '#000'}
          />
          <Text style={[styles.text, styles.loadingText]}>Working…</Text>
        </View>
      ) : null}
      <FlatList
        data={listData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({
          length: 72,
          offset: 72 * index,
          index,
        })}
      />
      <LogViewer styles={styles} log={log} />
    </SafeAreaView>
  );
};

export default ContactsDemoScreen;
