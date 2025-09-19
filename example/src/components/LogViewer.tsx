import React from 'react';
import { Text, View } from 'react-native';

import type { Styles } from '../styles';

type Props = {
  styles: Styles;
  log: string;
};

const LogViewer = React.memo(({ styles, log }: Props) => (
  <View style={styles.logBox}>
    <Text style={styles.logText}>{log}</Text>
  </View>
));

export default LogViewer;
