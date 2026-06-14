import { StyleSheet, Text, View, TouchableOpacity } from 'react-native'
import React from 'react'
import  MaterialIcons  from 'react-native-vector-icons/MaterialIcons'


export default function TodayEarning({ amount = 0, currency = '$', onDetailsPress }) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Today's Earnings</Text>
        
        <View style={styles.amountContainer}>
          <Text style={styles.currency}>{currency}</Text>
          <Text style={styles.amount}>{amount.toFixed(2)}</Text>
        </View>
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>Compared to yesterday: +12%</Text>
          <TouchableOpacity onPress={onDetailsPress} style={styles.detailsButton}>
            <MaterialIcons name="arrow-forward" size={20} color="#4A90E2" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
    fontWeight: '500',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 15,
  },
  currency: {
    fontSize: 24,
    color: '#333',
    marginRight: 5,
    fontWeight: '600',
  },
  amount: {
    fontSize: 32,
    color: '#333',
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  footerText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  detailsButton: {
    padding: 5,
  },
})