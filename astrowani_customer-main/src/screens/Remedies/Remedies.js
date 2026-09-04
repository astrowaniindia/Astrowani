import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Instance from '../../api/ApiCall';
import { LanguageContext } from '../../context/LanguageContext';
// The four categories, their bundled fallbacks and the admin-override merge now
// live in one place — Home's Remedies row renders the same four cards.
import { buildRemedyCategories } from './remedyCategories';
import { captureEvent } from '../../utils/Analytics';

const Remedies = () => {
  const navigation = useNavigation();
  const { language, t } = React.useContext(LanguageContext);
  const [categories, setCategories] = React.useState(null);

  const fetchCategories = React.useCallback(() => {
    Instance.get('/api/remedy-categories')
      .then((res) => setCategories(res?.data?.data || []))
      .catch(() => setCategories([])); // fall through to the i18n fallback below on any failure
  }, []);

  useFocusEffect(React.useCallback(() => { fetchCategories(); }, [fetchCategories]));

  const data = buildRemedyCategories(categories, language, t);

  const handleBookPuja = item => {
    navigation.navigate('RemedyShop', { type: item.type, title: item.title });
  };
  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => { captureEvent('remedy_category_tapped', { category: item?.type || item?.title || null }); handleBookPuja(item); }} style={styles.card}>
      <View style={styles.textContainer}>
        <View style={styles.textOverlay}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.description}>{item.description}</Text>
        </View>
      </View>
      <Image source={item.image} style={styles.image} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.listContainer, {paddingBottom: verticalScale(85)}]}>
        {data.map((item) => (
          <React.Fragment key={item.id}>
            {renderItem({ item })}
          </React.Fragment>
        ))}
      </ScrollView>
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
  card: {
    flexDirection: 'row',
    marginBottom: verticalScale(10),
    borderRadius: moderateScale(16),
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    height: verticalScale(120),
    borderWidth: 1.5,
    borderColor: '#592a19', // COLORS.AstroMaroon
  },
  textContainer: {
    flex: 2,
    justifyContent: 'center',
    paddingHorizontal: scale(5),
    position: 'relative',
  },

  textOverlay: {
    paddingHorizontal: scale(15),
    justifyContent: 'center',
  },
  title: {
    color: COLORS.black,
    fontSize: moderateScale(17),
    marginBottom: verticalScale(13),

    fontFamily: 'Lato-Bold',
  },
  description: {
    color: COLORS.black,
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
  },
  image: {
    height: '100%',
    width: scale(120),
    borderTopRightRadius: moderateScale(10),
    borderBottomRightRadius: moderateScale(10),
  },
});

export default Remedies;
