import { StyleSheet, Text, View, FlatList } from 'react-native';
import React from 'react';

export default function ChatHistorys() {
  const chatData = [
    { id: '1', name: 'John Doe', lastMessage: 'Hey there!' },
    { id: '2', name: 'Jane Smith', lastMessage: 'See you soon.' },
    { id: '3', name: 'Alex Lee', lastMessage: 'Thanks!' },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Chat History</Text>
      <FlatList
        data={chatData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.chatItem}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.message}>{item.lastMessage}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  chatItem: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  message: {
    fontSize: 14,
    color: '#555',
    marginTop: 4,
  },
});
