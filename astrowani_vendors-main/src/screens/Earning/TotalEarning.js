import { StyleSheet, Text, View, TouchableOpacity } from 'react-native'
import React from 'react'
import  MaterialCommunityIcons  from 'react-native-vector-icons/MaterialCommunityIcons'

export default function TotalEarning({ 
  amount = 0, 
  currency = '$', 
  period = 'this month',
  changePercentage = 0,
  onDetailsPress 
}) {
  const isPositive = changePercentage >= 0;
  
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Total Earnings</Text>
          <MaterialCommunityIcons 
            name="wallet-outline" 
            size={24} 
            color="#6C63FF" 
          />
        </View>
        
        <View style={styles.amountContainer}>
          <Text style={styles.currency}>{currency}</Text>
          <Text style={styles.amount}>{amount.toLocaleString()}</Text>
        </View>
        
        <View style={styles.footer}>
          <View style={styles.changeContainer}>
            <MaterialCommunityIcons 
              name={isPositive ? "arrow-up" : "arrow-down"} 
              size={16} 
              color={isPositive ? "#4CAF50" : "#F44336"} 
            />
            <Text style={[
              styles.changeText,
              { color: isPositive ? "#4CAF50" : "#F44336" }
            ]}>
              {Math.abs(changePercentage)}% {period}
            </Text>
          </View>
          
          <TouchableOpacity onPress={onDetailsPress} style={styles.detailsButton}>
            <Text style={styles.detailsText}>View Details</Text>
            <MaterialCommunityIcons 
              name="chevron-right" 
              size={20} 
              color="#6C63FF" 
            />
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
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  currency: {
    fontSize: 22,
    color: '#6C63FF',
    marginRight: 5,
    fontWeight: '600',
    marginBottom: 2,
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
    borderTopColor: '#f0f0f0',
    paddingTop: 15,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsText: {
    color: '#6C63FF',
    fontSize: 14,
    fontWeight: '500',
    marginRight: 4,
  },
})