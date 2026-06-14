/* import { StyleSheet, Text, View } from 'react-native'
import React, { useEffect, useState } from 'react'
import Instance from '../../api/ApiCall'

const VipPuja = () => {

    const [loading, setLoading] = useState(false)
    const [vipPujas, setVipPujas] = useState([])

    const getAllPuja = async () => {
        return await Instance.get(`/api/astro-services/vip-pujas?page=1&limit=10`).then((response) => {
            setVipPujas(response?.data?.data)
            console.log("response: ", response?.data);
            
            setLoading(false)
        }).catch((error) => {
            console.log('error on getAllPuja: ', error);
            setLoading(false);
        })
    }

    useEffect(() => {
        getAllPuja()
    }, [loading])


    return (
        <View>
            <Text>VipPuja</Text>
        </View>
    )
}

export default VipPuja

const styles = StyleSheet.create({}) */
import {
    ActivityIndicator,
    FlatList,
    Image,
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    RefreshControl
} from 'react-native';
import React, { useEffect, useState } from 'react';
import Instance from '../../api/ApiCall';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { useNavigation } from '@react-navigation/native';

const VipPuja = () => {
    const navigation = useNavigation();

    const [loading, setLoading] = useState(false);
    const [vipPujas, setVipPujas] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [refreshing, setRefreshing] = useState(false);
    const [totalVipPujas, setTotalVipPujas] = useState(0);

    const getAllPuja = async (page = 1) => {
        if (page > totalPages) return;
        setLoading(true);
        try {
            const response = await Instance.get(`/api/astro-services/vip-pujas?page=${page}&limit=10`);
            const data = response?.data;
            if (page === 1) {
                setVipPujas(data.vipPujas);
            } else {
                setVipPujas(prev => [...prev, ...data.vipPujas]);
            }
            setTotalPages(data.totalPages);
            setCurrentPage(data.currentPage);
        } catch (error) {
            console.log('error on getAllPuja: ', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        getAllPuja(1);
    }, []);

    const handleLoadMore = () => {
        if (!loading && currentPage < totalPages) {
            getAllPuja(currentPage + 1);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        getAllPuja(1);
    };

    // console.log("vipPujas: ", vipPujas);
    // console.log("currentPage: ", currentPage);
    // console.log("currentPage: ", currentPage);
    // console.log("totalPages: ", totalPages);


    /* const renderItem = ({ item }) => (
        <View style={styles.card}>
            {console.log("item: ", item)}
            <Image source={{ uri: item.image }} style={styles.image} />
            <View style={styles.info}>
                <Text style={styles.title}>{item.name}</Text>
                <Text style={styles.description}>{item.description}</Text>
                <Text style={styles.price}>₹{item.price}</Text>
            </View>
        </View>
    ); */

    const renderItem = ({ item }) => (
        <TouchableOpacity /* onPress={() => navigation.navigate('BookPujaScreen', { pujas: item })} */ style={styles.card}>
            <Image source={{ uri: item.image || 'https://th.bing.com/th/id/OIP.XKhDJsAyX2WTH1q0Y-ZtRAHaDu?w=347&h=176&c=7&r=0&o=5&pid=1.7', }} style={styles.image} />
            <View style={styles.infoContainer}>
                <Text style={styles.title}>{item.name || 'Puja name'}</Text>
                <Text style={styles.description}>{item.description || 'No description available'}</Text>

                {/* <View style={styles.detailsContainer}>
                    <View style={styles.detailItem}>
                        <Icon name="clock-o" size={moderateScale(16)} color={COLORS.AstroGold} />
                        <Text style={styles.detailText}>{item.duration || 'N/A'}</Text>
                    </View>
                    <View style={styles.detailItem}>
                        <Icon name="user" size={moderateScale(16)} color={COLORS.AstroGold} />
                        <Text style={styles.detailText}>{item.pujaGodGoddes || 'N/A'}</Text>
                    </View>
                </View> */}

                <Text style={styles.price}>₹{item.price || '0'}</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {loading ? (
                <ActivityIndicator size="large" color="#FEAC2F" />
            ) : (
                // <FlatList data={vipPujas} renderItem={renderItem} keyExtractor={item => item._id} showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContainer} />
                <FlatList
                    data={vipPujas}
                    renderItem={renderItem}
                    keyExtractor={item => item._id}
                    contentContainerStyle={styles.listContainer}
                    showsVerticalScrollIndicator={false}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.5}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                    }
                    ListFooterComponent={
                        loading && !refreshing ? (
                            <View style={{ paddingVertical: verticalScale(20) }}>
                                <ActivityIndicator size="small" color={COLORS.AstroGold} />
                            </View>
                        ) : null
                    }
                />
            )}

        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.AstroSoftOrange,
    },
    listContainer: {
        paddingVertical: verticalScale(10),
        paddingHorizontal: scale(15),
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: scale(20),
    },
    errorText: {
        color: COLORS.red,
        fontSize: moderateScale(16),
        textAlign: 'center',
    },
    card: {
        flexDirection: 'row',
        backgroundColor: COLORS.white,
        borderRadius: moderateScale(10),
        marginBottom: verticalScale(15),
        overflow: 'hidden',
        elevation: 3,
    },
    image: {
        width: scale(120),
        height: verticalScale(150),
    },
    infoContainer: {
        flex: 1,
        padding: moderateScale(10),
    },
    title: {
        color: COLORS.black,
        fontSize: moderateScale(18),
        fontFamily: 'Lato-Bold',
        marginBottom: verticalScale(5),
    },
    description: {
        color: COLORS.black,
        fontSize: moderateScale(14),
        fontFamily: 'Lato-Regular',
        marginBottom: verticalScale(10),
    },
    detailsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: verticalScale(10),
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    detailText: {
        color: COLORS.black,
        fontSize: moderateScale(14),
        fontFamily: 'Lato-Regular',
        marginLeft: scale(5),
    },
    price: {
        color: COLORS.AstroGold,
        fontSize: moderateScale(16),
        fontFamily: 'Lato-Bold',
        alignSelf: 'flex-end',
    },
});

export default VipPuja;