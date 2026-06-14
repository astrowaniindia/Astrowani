/* import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, } from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';

const BlogList = ({ navigation, route }) => {
  const { data } = route.params;

  // console.log('data', data);

  const renderBlogItem = ({ item }) => {
    const date = new Date(item.createdAt);
    const formattedDate = date.toLocaleDateString();
    return (
      <TouchableOpacity onPress={() => navigation.navigate('BlogScreen', { data: item })} style={styles.card}>
        <Image source={{ uri: item.thumbnail }} style={styles.image} resizeMode="cover" />
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.excerpt} numberOfLines={3}>{item.excerpt}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.category}>{item.category?.name}</Text>
            <Text style={styles.date}>{formattedDate}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={data.data} // Access the 'data' array inside the route params
        renderItem={renderBlogItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  listContent: {
    padding: scale(10),
  },
  card: {
    marginBottom: verticalScale(15),
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(10),
    overflow: 'hidden',
    elevation: 2,
  },
  image: {
    height: verticalScale(160),
    width: '100%',
  },
  textContainer: {
    padding: scale(10),
  },
  title: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: COLORS.black,
    marginBottom: verticalScale(5),
  },
  excerpt: {
    fontSize: moderateScale(14),
    color: COLORS.gray,
    marginBottom: verticalScale(5),
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: verticalScale(5),
  },
  category: {
    fontSize: moderateScale(12),
    color: COLORS.AstroMaroon,
    fontWeight: 'bold',
  },
  date: {
    fontSize: moderateScale(12),
    color: COLORS.AstroMaroon,
  },
});

export default BlogList; */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BlogList = ({ navigation }) => {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // const token = 'YOUR_AUTH_TOKEN'; // Replace with dynamic token if needed

  const fetchBlogs = async (pageNum = 1, isRefresh = false) => {
    if (loading) return;
    const token = await AsyncStorage.getItem('token');
    setLoading(true);
    try {
      const response = await Instance.get(`/api/blogs?limit=10&page=${pageNum}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const fetchedBlogs = response?.data?.data || [];
      const total = response?.data?.totalPages || 1;

      if (isRefresh) {
        setBlogs(fetchedBlogs);
      } else {
        setBlogs(prev => [...prev, ...fetchedBlogs]);
      }

      setTotalPages(total);
      setPage(pageNum);
    } catch (err) {
      console.error('Error fetching blogs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBlogs(1, true);
  }, []);

  const handleLoadMore = () => {
    if (!loading && page < totalPages) {
      fetchBlogs(page + 1);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBlogs(1, true);
  };

  const renderBlogItem = ({ item }) => {
    const date = new Date(item.createdAt);
    const formattedDate = date.toLocaleDateString();

    // console.log("item: ", item);


    return (
      <TouchableOpacity onPress={() => navigation.navigate('BlogScreen', { data: item })} style={styles.card}>
        <Image source={{ uri: item.thumbnail }} style={styles.image} resizeMode="cover" />
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.excerpt} numberOfLines={3}>{item.excerpt}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.category}>{item.category?.name}</Text>
            <Text style={styles.date}>{formattedDate}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={blogs}
        renderItem={renderBlogItem}
        keyExtractor={item => item._id}
        contentContainerStyle={styles.listContent}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListFooterComponent={
          loading && !refreshing ? (
            <View style={{ paddingVertical: verticalScale(20) }}>
              <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
            </View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  listContent: {
    padding: scale(10),
  },
  card: {
    marginBottom: verticalScale(15),
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(10),
    overflow: 'hidden',
    elevation: 2,
  },
  image: {
    height: verticalScale(160),
    width: '100%',
  },
  textContainer: {
    padding: scale(10),
  },
  title: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: COLORS.black,
    marginBottom: verticalScale(5),
  },
  excerpt: {
    fontSize: moderateScale(14),
    color: COLORS.gray,
    marginBottom: verticalScale(5),
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: verticalScale(5),
  },
  category: {
    fontSize: moderateScale(12),
    color: COLORS.AstroMaroon,
    fontWeight: 'bold',
  },
  date: {
    fontSize: moderateScale(12),
    color: COLORS.AstroMaroon,
  },
});

export default BlogList;