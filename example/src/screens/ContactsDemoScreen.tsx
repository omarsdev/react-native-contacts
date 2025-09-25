import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  PermissionsAndroid,
  Platform,
  StatusBar,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  commitPersisted,
  getPersistedSince,
  getUpdatedSincePaged,
  type ContactChange,
} from '@omarsdev/react-native-contacts';

import { createStyles, type Theme } from '../styles';
import { ChangeRow, ControlPanel, InfoPanel, LogViewer } from '../components';

const PAGE_FETCH_LIMIT = 300;

type DeltaTally = {
  created: number;
  updated: number;
  deleted: number;
};

type Props = {
  onTotalContactsChange?: (count: number | null) => void;
};

const ContactsDemoScreen = ({ onTotalContactsChange }: Props) => {
  const systemTheme = useColorScheme();
  const theme: Theme = systemTheme === 'dark' ? 'dark' : 'light';
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const [granted, setGranted] = React.useState<boolean>(Platform.OS === 'ios');
  const [loading, setLoading] = React.useState(false);
  const [changes, setChanges] = React.useState<ContactChange[]>([]);
  const [since, setSince] = React.useState('');
  const [deltaStatus, setDeltaStatus] = React.useState('No delta fetched yet');
  const [log, setLog] = React.useState('');
  const [totalContacts, setTotalContacts] = React.useState<number | null>(null);
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

  React.useEffect(() => {
    if (onTotalContactsChange) {
      onTotalContactsChange(totalContacts);
    }
  }, [onTotalContactsChange, totalContacts]);

  const fetchDelta = React.useCallback(async () => {
    if (!granted) {
      appendLog('Permission not granted');
      return;
    }
    setLoading(true);
    setDeltaStatus('Fetching delta…');
    try {
      const persistedSince = await getPersistedSince();
      let nextSince: string | undefined;
      let usedFullFallback = false;
      const collected: ContactChange[] = [];
      const started = Date.now();
      let latestTotal: number | null = null;
      let pageOffset = 0;

      await getUpdatedSincePaged.listen(
        { since: persistedSince, offset: 0, pageSize: PAGE_FETCH_LIMIT },
        async (response) => {
          if (response.mode === 'full') {
            const nextTotal =
              typeof response.totalContacts === 'number'
                ? response.totalContacts
                : response.items.length;
            latestTotal = nextTotal;
            setTotalContacts(nextTotal);
          }
          if (response.nextSince) {
            nextSince = response.nextSince;
          }
          appendLog(
            `Fetched ${response.mode} page: baseSince=${persistedSince} offset=${pageOffset} size=${response.items.length} total=${
              typeof response.totalContacts === 'number'
                ? response.totalContacts
                : '∅'
            } nextSince=${response.nextSince || '∅'}`
          );
          if (response.items.length === 0) {
            return false;
          }
          if (response.mode === 'delta') {
            collected.push(...response.items);
          } else {
            usedFullFallback = true;
            collected.push(
              ...response.items.map((contact) => ({
                ...contact,
                changeType: 'created' as ContactChange['changeType'],
                isDeleted: false,
                phoneNumberChanges: {
                  created: contact.phoneNumbers,
                  deleted: [],
                  updated: [],
                },
                previous: null,
              }))
            );
          }
          pageOffset += response.items.length;
          return true;
        }
      );
      setChanges(collected);
      const summary = collected.reduce<DeltaTally>(
        (acc, item) => ({
          ...acc,
          [item.changeType]: acc[item.changeType] + 1,
        }),
        { created: 0, updated: 0, deleted: 0 }
      );
      const committedSince =
        nextSince && nextSince !== persistedSince ? nextSince : undefined;
      if (committedSince) {
        await commitPersisted(committedSince);
        setSince(committedSince);
      } else {
        setSince(persistedSince);
      }
      const fallbackNote = usedFullFallback ? ' (full snapshot fallback)' : '';
      appendLog(
        `Completed delta fetch. Items=${collected.length} (created=${summary.created}, updated=${summary.updated}, deleted=${summary.deleted}) committedSince=${committedSince || persistedSince} in ${Date.now() - started}ms${fallbackNote}`
      );
      const finalTotal =
        typeof latestTotal === 'number' ? latestTotal : totalContacts;
      const totalNote =
        typeof finalTotal === 'number' ? `, total contacts ${finalTotal}` : '';
      setDeltaStatus(
        `Delta: ${collected.length} (created ${summary.created}, updated ${summary.updated}, deleted ${summary.deleted})${fallbackNote}${totalNote}`
      );
    } catch (error: any) {
      appendLog(`Error: ${error?.message || String(error)}`);
      setDeltaStatus('Error while fetching delta');
    } finally {
      setLoading(false);
    }
  }, [appendLog, granted, totalContacts]);

  const listLabel = 'Delta Contacts';
  const listData = changes;

  const renderItem = React.useCallback(
    ({ item }: { item: ContactChange }) => (
      <ChangeRow change={item} styles={styles} />
    ),
    [styles]
  );

  const keyExtractor = React.useCallback(
    (item: ContactChange, index: number) =>
      `${item.id}:${item.changeType}:${item.isDeleted}:${index}`,
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
        onFetchDelta={fetchDelta}
      />
      <InfoPanel
        styles={styles}
        deltaStatus={deltaStatus}
        granted={granted}
        loading={loading}
        since={since}
        listLabel={listLabel}
        listCount={listData.length}
        totalCount={totalContacts}
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
