import React from 'react';
import {
  Text,
  View,
  StyleSheet,
  Button,
  FlatList,
  PermissionsAndroid,
  Platform,
  useColorScheme,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import {
  getAllPaged,
  getPersistedSince,
  getUpdatedFromPersistedPaged,
  commitPersisted,
  type Contact,
} from '@omarsdev/react-native-contacts';

type Theme = 'light' | 'dark';

const createStyles = (theme: Theme) => {
  const colors =
    theme === 'dark'
      ? {
          bg: '#121212',
          text: '#FFFFFF',
          sub: '#BBBBBB',
          border: '#333333',
          logBg: '#1E1E1E',
          logText: '#8f8',
        }
      : {
          bg: '#FFFFFF',
          text: '#111111',
          sub: '#555555',
          border: '#E0E0E0',
          logBg: '#F5F5F5',
          logText: '#0a601a',
        };

  return StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: 48,
      paddingHorizontal: 16,
      backgroundColor: colors.bg,
    },
    controls: {
      flexDirection: 'column',
    },
    info: {
      marginVertical: 12,
    },
    spacer: { height: 8 },
    text: {
      color: colors.text,
    },
    row: {
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    name: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    id: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    sub: {
      color: colors.sub,
      fontSize: 12,
    },
    logBox: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.logBg,
      maxHeight: 160,
      padding: 8,
    },
    logText: {
      color: colors.logText,
      fontSize: 10,
    },
    listContent: {
      paddingBottom: 40,
    },
    loadingBox: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    loadingText: { marginLeft: 8 },
  });
};

export default function App() {
  const systemScheme = useColorScheme();
  const theme: Theme = systemScheme === 'dark' ? 'dark' : 'light';
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [granted, setGranted] = React.useState(Platform.OS === 'ios');
  const [loading, setLoading] = React.useState(false);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [delta, setDelta] = React.useState<Contact[]>([]);
  const [since, setSince] = React.useState<string>('');
  const [log, setLog] = React.useState<string>('');
  const [status, setStatus] = React.useState<string>('Idle');

  React.useEffect(() => {
    const ensurePermission = async () => {
      if (Platform.OS === 'android') {
        const res = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS
        );
        setGranted(res === PermissionsAndroid.RESULTS.GRANTED);
      }
      try {
        const s = await getPersistedSince();
        setSince(s || '');
      } catch {}
    };
    ensurePermission();
  }, []);

  const appendLog = (msg: string) =>
    setLog((prev) => `${new Date().toISOString()} ${msg}\n${prev}`);

  const onFetchAll = async () => {
    if (!granted) {
      appendLog('Permission not granted');
      return;
    }
    setLoading(true);
    setStatus('Fetching all (paged)…');
    setDelta([]);
    try {
      const pageSize = 300;
      let offset = 0;
      const acc: Contact[] = [];
      const t0 = Date.now();
      for (;;) {
        const page = await getAllPaged(offset, pageSize);
        appendLog(`Fetched page: offset=${offset} size=${page.length}`);
        if (!page || page.length === 0) break;
        acc.push(...page);
        offset += page.length;
        if (page.length < pageSize) break;
      }
      setContacts(acc);
      appendLog(
        `Completed full fetch. Total=${acc.length} in ${Date.now() - t0}ms`
      );
      setStatus(`All contacts: ${acc.length}`);
    } catch (e: any) {
      appendLog(`Error: ${e?.message || String(e)}`);
      setStatus('Error while fetching all');
    } finally {
      setLoading(false);
    }
  };

  const onFetchDelta = async () => {
    if (!granted) {
      appendLog('Permission not granted');
      return;
    }
    setLoading(true);
    setStatus('Fetching delta…');
    setContacts([]);
    try {
      const pageSize = 300;
      let offset = 0;
      const acc: Contact[] = [];
      let sessionToken = '';
      const t0 = Date.now();
      for (;;) {
        const resp = await getUpdatedFromPersistedPaged(offset, pageSize);
        const items = resp.items ?? [];
        if (!sessionToken) sessionToken = resp.nextSince || '';
        appendLog(
          `Fetched delta page: offset=${offset} size=${items.length} session=${sessionToken}`
        );
        if (items.length === 0) break;
        acc.push(...items);
        offset += items.length;
        if (items.length < pageSize) break;
      }
      setDelta(acc);
      if (sessionToken) {
        await commitPersisted(sessionToken);
        setSince(sessionToken);
      }
      appendLog(
        `Completed delta fetch. Items=${acc.length} committedSince=${sessionToken} in ${Date.now() - t0}ms`
      );
      setStatus(
        `Delta: ${acc.length} (since: ${sessionToken || since || 'n/a'})`
      );
    } catch (e: any) {
      appendLog(`Error: ${e?.message || String(e)}`);
      setStatus('Error while fetching delta');
    } finally {
      setLoading(false);
    }
  };

  const onReset = () => {
    setContacts([]);
    setDelta([]);
    setSince('');
    appendLog('State reset; since cleared');
    setStatus('Idle');
  };

  const onBaselineNow = async () => {
    try {
      const current = since || (await getPersistedSince()) || '';
      await commitPersisted(current);
      const after = await getPersistedSince();
      setSince(after);
      appendLog(`Baseline snapshot rebuilt. since=${after}`);
      setStatus('Baseline rebuilt');
    } catch (e: any) {
      appendLog(`Baseline error: ${e?.message || String(e)}`);
    }
  };

  const renderItem = ({ item }: { item: Contact }) => (
    <View style={styles.row}>
      <Text style={styles.id}>{item.id}</Text>
      <Text style={styles.name}>{item.displayName || '(no name)'}</Text>
      {item.lastUpdatedAt ? (
        <Text style={styles.sub}>
          {new Date(item.lastUpdatedAt).toLocaleString()}
        </Text>
      ) : null}
      <Text style={styles.sub} numberOfLines={1}>
        {item.phoneNumbers?.join(', ')}
      </Text>
    </View>
  );

  const data = contacts.length > 0 ? contacts : delta;
  const header = contacts.length > 0 ? 'All Contacts' : 'Delta Contacts';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <View style={styles.controls}>
        <Button
          title="Fetch All (paged)"
          onPress={onFetchAll}
          disabled={loading}
        />
        <View style={styles.spacer} />
        <Button title="Fetch Delta" onPress={onFetchDelta} disabled={loading} />
        <View style={styles.spacer} />
        <Button
          title="Baseline Now"
          onPress={onBaselineNow}
          disabled={loading}
        />
        <View style={styles.spacer} />
        <Button title="Reset UI" onPress={onReset} disabled={loading} />
      </View>
      <View style={styles.info}>
        <Text style={styles.text}>Status: {status}</Text>
        <Text style={styles.text}>
          Granted: {String(granted)} • Loading: {String(loading)}
        </Text>
        <Text style={styles.text}>
          Since: {since || '(empty)'}
          {since?.startsWith('fp:') ? ' • fingerprint' : ''}
        </Text>
        <Text style={styles.text}>
          Showing {data.length} {header}
        </Text>
      </View>
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
        data={data}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({
          length: 72,
          offset: 72 * index,
          index,
        })}
      />
      <View style={styles.logBox}>
        <Text style={styles.logText}>{log}</Text>
      </View>
    </SafeAreaView>
  );
}
