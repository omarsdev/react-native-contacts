import React from 'react';
import { Text, View } from 'react-native';

import type { Styles } from '../styles';

type Props = {
  styles: Styles;
  deltaStatus: string;
  granted: boolean;
  loading: boolean;
  since: string;
  listLabel: string;
  listCount: number;
};

const InfoPanel = React.memo(
  ({
    styles,
    deltaStatus,
    granted,
    loading,
    since,
    listLabel,
    listCount,
  }: Props) => (
    <View style={styles.info}>
      <Text style={styles.text}>Delta status: {deltaStatus}</Text>
      <Text style={styles.text}>
        Granted: {String(granted)} • Loading: {String(loading)}
      </Text>
      <Text style={styles.text}>
        Since: {since || '(empty)'}
        {since?.startsWith('fp:') ? ' • fingerprint' : ''}
      </Text>
      <Text style={styles.text}>
        Showing {listCount} {listLabel}
      </Text>
    </View>
  )
);

export default InfoPanel;
