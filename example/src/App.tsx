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
} from 'react-native';
import {
  getAllPaged,
  getPersistedSince,
  getUpdatedFromPersistedPaged,
  commitPersisted,
  type Contact,
} from 'react-native-contacts-last-updated';

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
    setDelta([]);
    try {
      const pageSize = 300;
      let offset = 0;
      const acc: Contact[] = [];
      // Loop pages
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const page = await getAllPaged(offset, pageSize);
        appendLog(`Fetched page: offset=${offset} size=${page.length}`);
        if (!page || page.length === 0) break;
        acc.push(...page);
        offset += page.length;
        if (page.length < pageSize) break;
      }
      setContacts(acc);
      appendLog(`Completed full fetch. Total=${acc.length}`);
    } catch (e: any) {
      appendLog(`Error: ${e?.message || String(e)}`);
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
    setContacts([]);
    try {
      const pageSize = 300;
      let offset = 0;
      const acc: Contact[] = [];
      let sessionToken = '';
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
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
        `Completed delta fetch. Items=${acc.length} committedSince=${sessionToken}`
      );
    } catch (e: any) {
      appendLog(`Error: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const onReset = () => {
    setContacts([]);
    setDelta([]);
    setSince('');
    appendLog('State reset; since cleared');
  };

  const renderItem = ({ item }: { item: Contact }) => (
    <View style={styles.row}>
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
    <View style={styles.container}>
      <StatusBar
        barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <View style={styles.controls}>
        <Button
          title="Fetch All (paged)"
          onPress={onFetchAll}
          disabled={loading}
        />
        <View style={{ height: 8 }} />
        <Button title="Fetch Delta" onPress={onFetchDelta} disabled={loading} />
        <View style={{ height: 8 }} />
        <Button title="Reset" onPress={onReset} disabled={loading} />
      </View>
      <View style={styles.info}>
        <Text style={styles.text}>Granted: {String(granted)}</Text>
        <Text style={styles.text}>Loading: {String(loading)}</Text>
        <Text style={styles.text}>Since token: {since || '(empty)'}</Text>
        <Text style={styles.text}>
          Showing {data.length} {header}
        </Text>
      </View>
      <FlatList
        data={data}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
      <View style={styles.logBox}>
        <Text style={styles.logText}>{log}</Text>
      </View>
    </View>
  );
}
