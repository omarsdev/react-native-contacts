import React from 'react';
import { Button, View } from 'react-native';

import type { Styles } from '../styles';

type Props = {
  styles: Styles;
  loading: boolean;
  onFetchDelta: () => void;
};

const ControlPanel = React.memo(({ styles, loading, onFetchDelta }: Props) => (
  <View style={styles.controls}>
    <Button title="Fetch Delta" onPress={onFetchDelta} disabled={loading} />
  </View>
));

export default ControlPanel;
