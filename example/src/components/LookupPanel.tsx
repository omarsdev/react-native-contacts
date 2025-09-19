import React from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import type { Contact } from '@omarsdev/react-native-contacts';

import ContactRow from './ContactRow';
import type { Styles, Theme } from '../styles';

type Props = {
  styles: Styles;
  theme: Theme;
  lookupId: string;
  loading: boolean;
  error: string | null;
  result: Contact | null;
  onChangeId: (value: string) => void;
  onLookup: () => void;
};

const LookupPanel = React.memo(
  ({
    styles,
    theme,
    lookupId,
    loading,
    error,
    result,
    onChangeId,
    onLookup,
  }: Props) => (
    <View style={styles.lookupSection}>
      <Text style={styles.lookupTitle}>Lookup contact by ID</Text>
      <TextInput
        value={lookupId}
        onChangeText={onChangeId}
        style={styles.input}
        placeholder="Enter contact identifier"
        placeholderTextColor={theme === 'dark' ? '#777' : '#999'}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.buttonRow}>
        <Button title="Get Contact" onPress={onLookup} disabled={loading} />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {result ? (
        <View style={styles.lookupResultBox}>
          <ContactRow contact={result} styles={styles} />
        </View>
      ) : null}
      {!result && !error ? (
        <Text style={styles.lookupNote}>
          Tip: run "Fetch All" to discover IDs, then test getById.
        </Text>
      ) : null}
    </View>
  )
);

export default LookupPanel;
