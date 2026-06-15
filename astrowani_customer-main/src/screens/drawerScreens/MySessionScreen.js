import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useNavigation, useRoute } from '@react-navigation/native';
import SessionDetails from '../component/SessionDetails';
import { moderateScale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { supabase } from '../../api/SupabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Tab = createMaterialTopTabNavigator();

// Generic component to fetch and render session history
const GenericSessionList = ({ tableName, sessionType }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const userStr = await AsyncStorage.getItem('userData');
        const user = userStr ? JSON.parse(userStr) : null;
        const myId = user?._id || user?.id || user?.userId;
        if (!myId) return;

        const { data: records, error } = await supabase
          .from('chat_sessions')
          .select('*')
          .eq('caller_id', myId)
          .order('created_at', { ascending: false });
        
        if (records) {
          const { data: astros } = await supabase.from('astrologers').select('id, first_name, last_name, profile_pic_url');
          const astroMap = {};
          if (astros) astros.forEach(a => astroMap[a.id] = a);

          const formatted = records.map(item => {
            const astro = astroMap[item.vendor_id];
            const end = new Date(item.ended_at || item.created_at);
            const start = new Date(item.created_at);
            const durationMins = Math.max(1, Math.ceil((end - start) / 60000));

            return {
              id: item.id?.toString(),
              referenceId: item.request_id || item.id || 'N/A',
              name: astro ? `${astro.first_name || ''} ${astro.last_name || ''}`.trim() : 'Astrologer',
              chatType: sessionType,
              time: item.created_at ? new Date(item.created_at).toLocaleString('en-IN') : 'N/A',
              rate: item.per_minute_charge || 0,
              duration: durationMins,
              deduction: durationMins * (item.per_minute_charge || 0),
              image: astro?.profile_pic_url || 'https://cdn-icons-png.flaticon.com/128/3135/3135715.png',
            };
          });
          setData(formatted);
        }
      } catch (err) {
        console.log("Error fetching history:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [tableName]);

  if (loading) {
    return <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}><ActivityIndicator size="large" color={COLORS.AstroMaroon}/></View>;
  }

  return (
    <FlatList 
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({item}) => <SessionDetails session={item} handleprofile={() => {}} />}
      contentContainerStyle={{ paddingBottom: 20 }}
      ListEmptyComponent={<View style={{flex:1, alignItems:'center', marginTop: 50}}><Text>No {sessionType} found.</Text></View>}
    />
  );
};

const ChatSession = () => <GenericSessionList tableName="chat_history" sessionType="Chat Session" />;
const CallSession = () => <GenericSessionList tableName="call_history" sessionType="Call Session" />;
const VideoSession = () => <GenericSessionList tableName="video_call_history" sessionType="Video Session" />;

const MySessionsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();

  return (
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
        tabBarInactiveTintColor: '#000',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderBottomWidth: verticalScale(1),
          borderBottomColor: '#ddd',
        },
        tabBarPressColor: COLORS.AstroSoftOrange,
      }}>
      <Tab.Screen
        name="ChatSession"
        component={ChatSession}
        options={{title: 'Chat Session'}}
      />
      <Tab.Screen
        name="CallSession"
        component={CallSession}
        options={{title: 'Call Session'}}
      />
      <Tab.Screen
        name="VideoSession"
        component={VideoSession}
        options={{title: 'Video Session'}}
      />
    </Tab.Navigator>
  );
};

export default MySessionsScreen;
