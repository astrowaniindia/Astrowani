import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, RefreshControl } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../api/SupabaseClient';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';
import useNotificationBadgeSync from '../../hooks/useNotificationBadgeSync';

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

// Groups a descending-by-date list into Today / Yesterday / This Week / Earlier
// sections — turns a flat scroll into something that reads like a real inbox.
function groupByDay(notifications) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  const yesterday = today - 86400000;
  const weekAgo = today - 6 * 86400000;

  const buckets = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };
  for (const item of notifications) {
    const day = startOfDay(new Date(item.created_at));
    if (day === today) buckets.Today.push(item);
    else if (day === yesterday) buckets.Yesterday.push(item);
    else if (day >= weekAgo) buckets['This Week'].push(item);
    else buckets.Earlier.push(item);
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([title, data]) => ({ title, data }));
}

const NotificationScreen = () => {
  const { t } = React.useContext(LanguageContext);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [customerId, setCustomerId] = useState(null);

  const load = useCallback(async () => {
    try {
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr) { setLoading(false); return; }
      const userData = JSON.parse(userDataStr);
      if (!userData?.id) { setLoading(false); return; }
      setCustomerId(userData.id);

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('customer_id', userData.id)
        .order('created_at', { ascending: false });
      if (error) console.log('Notification fetch error:', error.message);
      setNotifications(data || []);
    } catch (e) {
      console.log('Error loading notifications:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live refresh via the backend's existing socket event (see
  // hooks/useNotificationBadgeSync.js) instead of this screen's own direct
  // Supabase Realtime subscription — see that hook's header comment for why no
  // backend Realtime subscription is needed at all for this table.
  useNotificationBadgeSync(customerId, load);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const markAsRead = async (item) => {
    if (item.is_read) return;
    setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', item.id);
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
  };

  const sections = useMemo(() => groupByDay(notifications), [notifications]);
  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const renderNotification = ({ item }) => (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.notificationCard, item.is_read && styles.readCard]}
      onPress={() => markAsRead(item)}>
      <View style={[styles.iconBadgeRing, item.is_read ? styles.iconBadgeRingRead : styles.iconBadgeRingUnread]}>
        <View style={[styles.iconBadge, item.is_read ? styles.iconBadgeRead : styles.iconBadgeUnread]}>
          <Icon name="notifications" size={19} color={item.is_read ? COLORS.AstroMaroon : COLORS.white} />
        </View>
      </View>
      <View style={styles.textContainer}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, item.is_read && styles.titleRead]} numberOfLines={1}>{item.title}</Text>
          {!item.is_read && (
            <View style={styles.newPill}>
              <Text style={styles.newPillText}>NEW</Text>
            </View>
          )}
        </View>
        <Text style={styles.message} numberOfLines={2}>{item.body}</Text>
        <View style={styles.timeRow}>
          <Icon name="schedule" size={12} color="#B3A296" />
          <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerOverlap}>
        <View style={styles.handleBar} />
        <View style={styles.summaryRow}>
          <View style={styles.summaryLeft}>
            <View style={styles.summaryDot} />
            <Text style={styles.summaryText}>
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
                : 'All caught up'}
            </Text>
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.summaryDivider} />

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeader}>{title}</Text>
              <View style={styles.sectionHeaderLine} />
            </View>
          )}
          contentContainerStyle={styles.listContainer}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.AstroMaroon} />}
          ListEmptyComponent={
            !loading && (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Icon name="notifications-off" size={40} color={COLORS.AstroMaroon} />
                </View>
                <Text style={styles.emptyText}>{t('notifications.none')}</Text>
              </View>
            )
          }
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroMaroon,
  },
  headerOverlap: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
    borderTopLeftRadius: moderateScale(26),
    borderTopRightRadius: moderateScale(26),
    marginTop: verticalScale(-14),
    paddingTop: verticalScale(10),
    overflow: 'hidden',
  },
  handleBar: {
    width: scale(38),
    height: verticalScale(4),
    borderRadius: verticalScale(2),
    backgroundColor: 'rgba(89,42,25,0.18)',
    alignSelf: 'center',
    marginBottom: verticalScale(14),
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(20),
    paddingBottom: verticalScale(12),
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryDot: {
    width: scale(7),
    height: scale(7),
    borderRadius: scale(3.5),
    backgroundColor: COLORS.AstroMaroon,
    marginRight: scale(7),
  },
  summaryText: {
    fontSize: moderateScale(13.5),
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
  },
  markAllBtn: {
    backgroundColor: 'rgba(89,42,25,0.08)',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(5),
    borderRadius: moderateScale(20),
  },
  markAllText: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(89,42,25,0.12)',
    marginHorizontal: scale(20),
  },
  listContainer: {
    padding: scale(16),
    paddingTop: verticalScale(10),
    flexGrow: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(14),
    marginBottom: verticalScale(10),
    marginLeft: scale(4),
  },
  sectionHeader: {
    fontSize: moderateScale(12.5),
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
    color: '#A15A3B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginRight: scale(10),
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(89,42,25,0.15)',
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: scale(14),
    borderRadius: moderateScale(18),
    marginBottom: verticalScale(12),
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(89,42,25,0.1)',
    elevation: 5,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  readCard: {
    backgroundColor: '#FBF6EF',
    borderColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
  },
  iconBadgeRing: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(12),
  },
  iconBadgeRingUnread: {
    backgroundColor: 'rgba(89,42,25,0.1)',
  },
  iconBadgeRingRead: {
    backgroundColor: 'transparent',
  },
  iconBadge: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBadgeUnread: {
    backgroundColor: COLORS.AstroMaroon,
  },
  iconBadgeRead: {
    backgroundColor: COLORS.AstroSoftOrange,
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    fontSize: moderateScale(15.5),
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
    marginBottom: verticalScale(4),
  },
  titleRead: {
    color: '#8A7A6E',
  },
  newPill: {
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(2),
    borderRadius: moderateScale(8),
    marginLeft: scale(8),
  },
  newPillText: {
    fontSize: moderateScale(9),
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  message: {
    fontSize: moderateScale(13.5),
    fontFamily: 'Lato-Regular',
    color: '#6B5C50',
    lineHeight: moderateScale(19),
    marginBottom: verticalScale(6),
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  time: {
    fontSize: moderateScale(11.5),
    fontFamily: 'Lato-Regular',
    color: '#A99A8C',
    marginLeft: scale(4),
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(80),
  },
  emptyIconCircle: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  emptyText: {
    marginTop: verticalScale(14),
    fontSize: moderateScale(16),
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Regular',
  },
});

export default NotificationScreen;
