import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ContactsDemoScreen from './screens/ContactsDemoScreen';
import { getUpdatedSincePaged } from '@omarsdev/react-native-contacts';

export default function App() {
  const [totalContacts, setTotalContacts] = React.useState<number | null>(null);

  useEffect(() => {
    const getContacts = async () => {
      await getUpdatedSincePaged.listen(
        { since: '', pageSize: 1 },
        async (page) => {
          console.log(`Page mode=${page.mode} size=${page.items.length}`, {
            items: page.items,
          });
        }
      );
    };

    getContacts();
  });

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <View style={styles.body}>
          <ContactsDemoScreen onTotalContactsChange={setTotalContacts} />
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Total device contacts:{' '}
            {typeof totalContacts === 'number' ? totalContacts : '—'}
          </Text>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  body: {
    flex: 1,
  },
  footer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d0d0d0',
    backgroundColor: '#ffffff',
  },
  footerText: {
    textAlign: 'center',
    color: '#333333',
  },
});
