import React from 'react';
import { Text, View } from 'react-native';
import type { Contact } from '@omarsdev/react-native-contacts';

import type { Styles } from '../styles';

type Props = {
  contact: Contact;
  styles: Styles;
};

const ContactRow = React.memo(({ contact, styles }: Props) => (
  <View style={styles.row}>
    <Text style={styles.id}>{contact.id}</Text>
    <Text style={styles.name}>{contact.displayName || '(no name)'}</Text>
    {contact.lastUpdatedAt ? (
      <Text style={styles.sub}>
        {new Date(contact.lastUpdatedAt).toLocaleString()}
      </Text>
    ) : null}
    <Text style={styles.sub} numberOfLines={1}>
      {contact.phoneNumbers?.join(', ')}
    </Text>
  </View>
));

export default ContactRow;
