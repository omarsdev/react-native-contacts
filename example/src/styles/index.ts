import { Platform, StyleSheet } from 'react-native';

export type Theme = 'light' | 'dark';

export function createStyles(theme: Theme) {
  const palette =
    theme === 'dark'
      ? {
          bg: '#121212',
          text: '#FFFFFF',
          sub: '#BBBBBB',
          border: '#333333',
          logBg: '#1E1E1E',
          logText: '#8f8',
          changeCreatedBg: '#1b5e20',
          changeCreatedText: '#c8facc',
          changeUpdatedBg: '#0d47a1',
          changeUpdatedText: '#c7dcff',
          changeDeletedBg: '#b33939',
          changeDeletedText: '#ffe0e0',
          deletedText: '#ffb3b3',
        }
      : {
          bg: '#FFFFFF',
          text: '#111111',
          sub: '#555555',
          border: '#E0E0E0',
          logBg: '#F5F5F5',
          logText: '#0a601a',
          changeCreatedBg: '#e8f5e9',
          changeCreatedText: '#1b5e20',
          changeUpdatedBg: '#e3f2fd',
          changeUpdatedText: '#0b5394',
          changeDeletedBg: '#fdecea',
          changeDeletedText: '#c0392b',
          deletedText: '#d32f2f',
        };

  return StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: 48,
      paddingHorizontal: 16,
      backgroundColor: palette.bg,
    },
    controls: {
      flexDirection: 'column',
    },
    info: {
      marginVertical: 12,
    },
    spacer: { height: 8 },
    text: {
      color: palette.text,
    },
    row: {
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border,
    },
    name: {
      fontSize: 16,
      fontWeight: '500',
      color: palette.text,
    },
    id: {
      fontSize: 16,
      fontWeight: '600',
      color: palette.text,
    },
    sub: {
      color: palette.sub,
      fontSize: 12,
    },
    logBox: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: palette.logBg,
      maxHeight: 160,
      padding: 8,
    },
    logText: {
      color: palette.logText,
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
    changeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 4,
    },
    changeBadge: {
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    changeBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    changeBadgeCreated: {
      backgroundColor: palette.changeCreatedBg,
    },
    changeBadgeCreatedText: {
      color: palette.changeCreatedText,
    },
    changeBadgeUpdated: {
      backgroundColor: palette.changeUpdatedBg,
    },
    changeBadgeUpdatedText: {
      color: palette.changeUpdatedText,
    },
    changeBadgeDeleted: {
      backgroundColor: palette.changeDeletedBg,
    },
    changeBadgeDeletedText: {
      color: palette.changeDeletedText,
    },
    deltaLine: {
      color: palette.sub,
      fontSize: 12,
      marginTop: 2,
    },
    deltaLineStrong: {
      color: palette.text,
    },
    deletedLine: {
      color: palette.deletedText,
      fontWeight: '600',
    },
    previousBlock: {
      marginTop: 6,
    },
    previousLabel: {
      fontSize: 11,
      color: palette.sub,
      fontStyle: 'italic',
    },
    input: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
      color: palette.text,
      backgroundColor: theme === 'dark' ? '#1b1b1b' : '#fafafa',
    },
    lookupSection: {
      marginTop: 16,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border,
    },
    lookupTitle: {
      color: palette.text,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 8,
    },
    errorText: {
      color: '#d14343',
      fontSize: 12,
      marginTop: 4,
    },
    lookupResultBox: {
      marginTop: 8,
    },
    lookupNote: {
      color: palette.sub,
      fontSize: 12,
      marginTop: 6,
    },
    buttonRow: {
      marginTop: 8,
    },
  });
}

export type Styles = ReturnType<typeof createStyles>;
