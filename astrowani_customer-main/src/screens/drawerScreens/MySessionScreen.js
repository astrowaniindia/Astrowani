import React, {useState, useCallback, useRef} from 'react';
import {View, Text, FlatList, ActivityIndicator, StyleSheet} from 'react-native';
import {createMaterialTopTabNavigator} from '@react-navigation/material-top-tabs';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import SessionDetails from '../component/SessionDetails';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import {supabase} from '../../api/SupabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Tab = createMaterialTopTabNavigator();

const getCustomerId = async () => {
  const userStr = await AsyncStorage.getItem('userData');
  const user = userStr ? JSON.parse(userStr) : null;
  return user?.id || user?._id || user?.userId || null;
};

const SessionList = ({callTypes, sessionTypeLabel}) => {
  const navigation = useNavigation();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);
  const astroMapRef = useRef({});

  const resolveAstro = useCallback(async vendorId => {
    if (!vendorId) return null;
    if (astroMapRef.current[vendorId]) return astroMapRef.current[vendorId];
    const {data: a} = await supabase
      .from('astrologers')
      .select('id, first_name, last_name, profile_pic_url, profile_image')
      .eq('id', vendorId)
      .single();
    if (a) astroMapRef.current[vendorId] = a;
    return a || null;
  }, []);

  const formatSession = useCallback(
    (item, astro) => {
      const start = new Date(item.started_at || item.created_at);
      const end = item.ended_at ? new Date(item.ended_at) : null;
      const durationMins = end
        ? Math.max(1, Math.round((end - start) / 60000))
        : 0;
      const deduction = Math.round(durationMins * (item.per_minute_charge || 0));

      const name = astro
        ? `${astro.first_name || ''} ${astro.last_name || ''}`.trim() || 'Astrologer'
        : 'Astrologer';
      const image =
        astro?.profile_image ||
        astro?.profile_pic_url ||
        'https://cdn-icons-png.flaticon.com/128/3135/3135715.png';

      return {
        id: item.id?.toString(),
        referenceId: item.id || 'N/A',
        name,
        chatType: sessionTypeLabel,
        time: start.toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true,
        }),
        rate: item.per_minute_charge || 0,
        duration: durationMins,
        deduction,
        image,
        isActive: item.is_active || false,
        // Minimal person object so the card's "View Profile" can open AstrologerInfo.
        astro: {
          userId: item.vendor_id,
          _id: item.vendor_id,
          name,
          profileImage: image,
        },
      };
    },
    [sessionTypeLabel],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        setLoading(true);
        try {
          const myId = await getCustomerId();
          if (!myId) return;

          const {data: records, error} = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('caller_id', myId)
            .in('call_type', callTypes)
            .order('started_at', {ascending: false})
            .limit(100);

          if (error || !records || !active) return;

          // Bulk-fetch astrologer info
          const vendorIds = [...new Set(records.map(r => r.vendor_id).filter(Boolean))];
          if (vendorIds.length) {
            const {data: astros} = await supabase
              .from('astrologers')
              .select('id, first_name, last_name, profile_pic_url, profile_image')
              .in('id', vendorIds);
            if (astros) astros.forEach(a => (astroMapRef.current[a.id] = a));
          }

          const formatted = records.map(item =>
            formatSession(item, astroMapRef.current[item.vendor_id]),
          );
          if (active) setData(formatted);

          // ── Realtime subscription ─────────────────────────────────────────
          if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
          }

          const channel = supabase
            .channel(
              `cust_sessions_${callTypes[0]}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
            )
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_sessions',
                filter: `caller_id=eq.${myId}`,
              },
              async payload => {
                const row = payload.new;
                if (!row || !callTypes.includes(row.call_type)) return;
                const astro = await resolveAstro(row.vendor_id);
                if (!active) return;
                setData(prev => {
                  if (prev.some(s => s.id === row.id?.toString())) return prev;
                  return [formatSession(row, astro), ...prev];
                });
              },
            )
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'chat_sessions',
                filter: `caller_id=eq.${myId}`,
              },
              payload => {
                const row = payload.new;
                if (!row || !callTypes.includes(row.call_type)) return;
                if (!active) return;
                setData(prev =>
                  prev.map(s =>
                    s.id === row.id?.toString()
                      ? formatSession(row, astroMapRef.current[row.vendor_id])
                      : s,
                  ),
                );
              },
            )
            .subscribe();

          channelRef.current = channel;
        } catch (e) {
          console.log('[MySessionScreen] load error:', e);
        } finally {
          if (active) setLoading(false);
        }
      };

      load();

      return () => {
        active = false;
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    }, [callTypes.join(',')]),
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={item => item.id}
      renderItem={({item}) => (
        <SessionDetails
          session={item}
          handleprofile={s => navigation.navigate('AstrologerInfo', {person: s.astro})}
        />
      )}
      contentContainerStyle={
        data.length === 0 ? styles.emptyContainer : styles.listContent
      }
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No {sessionTypeLabel} found</Text>
          <Text style={styles.emptySubText}>
            Sessions will appear here after they end
          </Text>
        </View>
      }
    />
  );
};

const ChatSession  = () => <SessionList callTypes={['chat']}           sessionTypeLabel="Chat Session" />;
const CallSession  = () => <SessionList callTypes={['audio', 'voice']} sessionTypeLabel="Audio Call" />;
const VideoSession = () => <SessionList callTypes={['video']}          sessionTypeLabel="Video Call" />;
const LiveSession  = () => <SessionList callTypes={['live']}           sessionTypeLabel="Live Session" />;

const MySessionsScreen = () => (
  <Tab.Navigator
    initialRouteName="ChatSession"
    screenOptions={{
      tabBarScrollEnabled: true,
      tabBarLabelStyle: {
        fontSize: moderateScale(13),
        fontWeight: 'bold',
        textTransform: 'none',
      },
      tabBarIndicatorStyle: {
        backgroundColor: COLORS.AstroMaroon,
        height: verticalScale(3),
      },
      tabBarActiveTintColor: COLORS.AstroMaroon,
      tabBarInactiveTintColor: '#888',
      tabBarStyle: {
        backgroundColor: '#fff',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      tabBarPressColor: COLORS.AstroSoftOrange,
    }}>
    <Tab.Screen name="ChatSession"  component={ChatSession}  options={{title: 'Chat'}} />
    <Tab.Screen name="CallSession"  component={CallSession}  options={{title: 'Audio Call'}} />
    <Tab.Screen name="VideoSession" component={VideoSession} options={{title: 'Video Call'}} />
    <Tab.Screen name="LiveSession"  component={LiveSession}  options={{title: 'Live'}} />
  </Tab.Navigator>
);

export default MySessionsScreen;

const styles = StyleSheet.create({
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  listContent: {paddingBottom: verticalScale(30)},
  emptyContainer: {flexGrow: 1},
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: verticalScale(80),
    gap: verticalScale(8),
  },
  emptyText: {
    fontSize: moderateScale(16),
    fontWeight: '700',
    color: '#999',
  },
  emptySubText: {
    fontSize: moderateScale(12),
    color: '#bbb',
    textAlign: 'center',
    paddingHorizontal: scale(30),
  },
});
