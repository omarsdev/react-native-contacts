import React from 'react';
import { Text, View } from 'react-native';
import type { ContactChange } from '@omarsdev/react-native-contacts';

import type { Styles } from '../styles';

type Props = {
  change: ContactChange;
  styles: Styles;
};

/**
 * Renders detailed information about a changed contact, including number diffs
 * and the previous snapshot when available.
 */
const ChangeRow = React.memo(({ change, styles }: Props) => {
  const { phoneNumberChanges, previous } = change;
  const created = phoneNumberChanges?.created ?? [];
  const deleted = phoneNumberChanges?.deleted ?? [];
  const updated = phoneNumberChanges?.updated ?? [];

  const badgeStyles = React.useMemo(() => {
    let background = styles.changeBadgeCreated;
    let textColor = styles.changeBadgeCreatedText;
    if (change.changeType === 'updated') {
      background = styles.changeBadgeUpdated;
      textColor = styles.changeBadgeUpdatedText;
    } else if (change.changeType === 'deleted') {
      background = styles.changeBadgeDeleted;
      textColor = styles.changeBadgeDeletedText;
    }

    return {
      container: [styles.changeBadge, background],
      text: [styles.changeBadgeText, textColor],
    } as const;
  }, [change.changeType, styles]);

  const nameChanged =
    previous?.displayName && previous.displayName !== change.displayName;

  return (
    <View style={styles.row}>
      <View style={styles.changeHeader}>
        <Text style={styles.name}>{change.displayName || '(no name)'}</Text>
        <View style={badgeStyles.container}>
          <Text style={badgeStyles.text}>{change.changeType}</Text>
        </View>
      </View>
      <Text style={styles.sub}>{change.id}</Text>
      {change.lastUpdatedAt ? (
        <Text style={styles.sub}>
          {new Date(change.lastUpdatedAt).toLocaleString()}
        </Text>
      ) : null}
      {!change.isDeleted && change.phoneNumbers.length > 0 ? (
        <Text style={[styles.deltaLine, styles.deltaLineStrong]}>
          Current numbers: {change.phoneNumbers.join(', ')}
        </Text>
      ) : null}
      {created.length > 0 ? (
        <Text style={styles.deltaLine}>
          Added numbers: {created.join(', ')}
        </Text>
      ) : null}
      {updated.length > 0 ? (
        <Text style={styles.deltaLine}>
          Updated numbers:{' '}
          {updated.map((u) => `${u.previous} → ${u.current}`).join(', ')}
        </Text>
      ) : null}
      {deleted.length > 0 ? (
        <Text style={styles.deltaLine}>
          Removed numbers: {deleted.join(', ')}
        </Text>
      ) : null}
      {change.isDeleted ? (
        <Text style={[styles.deltaLine, styles.deletedLine]}>
          Contact removed from device
        </Text>
      ) : null}
      {(nameChanged || (previous?.phoneNumbers?.length ?? 0) > 0) && (
        <View style={styles.previousBlock}>
          <Text style={styles.previousLabel}>Previous snapshot</Text>
          {nameChanged ? (
            <Text style={styles.deltaLine}>
              Name was: {previous?.displayName || '(no name)'}
            </Text>
          ) : null}
          {previous?.phoneNumbers?.length ? (
            <Text style={styles.deltaLine}>
              Numbers were: {previous.phoneNumbers.join(', ')}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
});

export default ChangeRow;
