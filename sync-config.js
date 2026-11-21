/* Cross-device sync (Firebase Firestore, free Spark plan). Fill in projectId and apiKey from the
   Firebase console (Project settings → Your apps → Web app). These values are not secrets: access
   is controlled by the Firestore security rules (see README). Leave projectId empty to turn sync off. */
window.OVB_SYNC = window.OVB_SYNC || { projectId: 'homework-529af', apiKey: '' };
