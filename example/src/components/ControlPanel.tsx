import React from 'react';
import { Button, View } from 'react-native';

import type { Styles } from '../styles';

type Props = {
  styles: Styles;
  loading: boolean;
  onFetchPage: () => void;
  onFetchAll: () => void;
  onFetchDelta: () => void;
  onReset: () => void;
};

const ControlPanel = React.memo(
  ({
    styles,
    loading,
    onFetchPage,
    onFetchAll,
    onFetchDelta,
    onReset,
  }: Props) => (
    <View style={styles.controls}>
      <Button
        title="Fetch All Page (300)"
        onPress={onFetchPage}
        disabled={loading}
      />
      <View style={styles.spacer} />
      <Button
        title="Fetch All (complete)"
        onPress={onFetchAll}
        disabled={loading}
      />
      <View style={styles.spacer} />
      <Button title="Fetch Delta" onPress={onFetchDelta} disabled={loading} />
      <View style={styles.spacer} />
      <Button title="Reset UI" onPress={onReset} disabled={loading} />
    </View>
  )
);

export default ControlPanel;
