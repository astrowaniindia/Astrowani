import React, { useEffect, useState, useContext } from 'react';
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
import { supabase } from '../../api/SupabaseClient';
import { LanguageContext } from '../../context/LanguageContext';

const BlogList = ({ navigation }) => {
  const { language } = useContext(LanguageContext);
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

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

  useEffect(() => {
    const channelName = `blog-list-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blogs' }, () => fetchBlogs(1, true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
    const isHindi = language === 'Hindi';
    const title = isHindi ? (item.hindi?.title || item.title) : item.title;
    const excerpt = isHindi ? (item.hindi?.excerpt || item.excerpt) : item.excerpt;
    const date = new Date(item.createdAt);
    const formattedDate = date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('BlogScreen', { data: item })}
        style={styles.card}
        activeOpacity={0.85}
      >
        <Image
          source={{ uri: item.thumbnail }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.textContainer}>
          {item.category?.name ? (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{item.category.name}</Text>
            </View>
          ) : null}
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {excerpt ? (
            <Text style={styles.excerpt} numberOfLines={2}>{excerpt}</Text>
          ) : null}
          <Text style={styles.date}>{formattedDate}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No blogs available yet.</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={blogs}
        renderItem={renderBlogItem}
        keyExtractor={item => item._id}
        contentContainerStyle={[
          styles.listContent,
          blogs.length === 0 && { flex: 1 },
        ]}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.AstroMaroon]}
          />
        }
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          loading && !refreshing ? (
            <View style={styles.footerLoader}>
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
    backgroundColor: '#F5F5F5',
  },
  listContent: {
    paddingHorizontal: scale(14),
    paddingTop: verticalScale(14),
    paddingBottom: verticalScale(24),
  },
  card: {
    marginBottom: verticalScale(16),
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(12),
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  image: {
    height: verticalScale(185),
    width: '100%',
    backgroundColor: '#E8E8E8',
  },
  textContainer: {
    padding: scale(14),
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF0F0',
    borderRadius: moderateScale(4),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    marginBottom: verticalScale(8),
  },
  categoryBadgeText: {
    fontSize: moderateScale(10),
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    color: '#1A1A1A',
    lineHeight: moderateScale(23),
    marginBottom: verticalScale(6),
  },
  excerpt: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    color: '#666666',
    lineHeight: moderateScale(19),
    marginBottom: verticalScale(10),
  },
  date: {
    fontSize: moderateScale(11),
    fontFamily: 'Lato-Regular',
    color: '#999999',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(60),
  },
  emptyText: {
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Regular',
    color: COLORS.gray,
  },
  footerLoader: {
    paddingVertical: verticalScale(20),
    alignItems: 'center',
  },
});

export default BlogList;
