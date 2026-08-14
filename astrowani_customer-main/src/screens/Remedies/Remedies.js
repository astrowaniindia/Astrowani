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

// Bundled fallback images/titles — used whenever the admin hasn't set a category's
// title/description/image yet (or the fetch fails), so this screen never breaks or
// goes blank. See astrowani-admin's Remedies page → "Edit ... section" for the
// admin-editable version of these (table remedy_categories).
const DEFAULTS = {
  puja: {
    title: 'Puja',
    description: 'Join shared rituals by renowned Purohits and Pandits for blessings and positivity.',
    image: require('../../assets/images/specificPuja.jpg'),
  },
  gemstone: {
    title: 'Gemstones',
    description: 'Buy certified gemstones to balance energies and support your astrological goals.',
    image: require('../../assets/images/gemsStones.jpg'),
  },
  specific_puja: {
    title: 'Specific Puja',
    description: 'Buy certified gemstones to balance energies and support your astrological goals.',
    image: require('../../assets/images/groupPuja.jpg'),
  },
  life_report: {
    title: 'Life Reports',
    description: 'One-time detailed reports on your career, marriage, health, or finances.',
    image: require('../../assets/images/specificPuja.jpg'),
  },
};
const ORDER = ['puja', 'gemstone', 'specific_puja', 'life_report'];

const Remedies = () => {
  const navigation = useNavigation();
  const { language } = React.useContext(LanguageContext);
  const [categories, setCategories] = React.useState(null);

  const fetchCategories = React.useCallback(() => {
    Instance.get('/api/remedy-categories')
      .then((res) => setCategories(res?.data?.data || []))
      .catch(() => setCategories([])); // fall through to DEFAULTS below on any failure
  }, []);

  useFocusEffect(React.useCallback(() => { fetchCategories(); }, [fetchCategories]));

  // Merge admin-set fields over the bundled defaults, per type, in the fixed
  // display order — an admin can set only some fields (e.g. just the image) and
  // the rest still falls back cleanly.
  const data = ORDER.map((type) => {
    const fallback = DEFAULTS[type];
    const fromApi = (categories || []).find((c) => c.type === type);
    const title = language === 'Hindi' ? (fromApi?.hindi?.title || fromApi?.title) : fromApi?.title;
    const description = language === 'Hindi' ? (fromApi?.hindi?.description || fromApi?.description) : fromApi?.description;
    return {
      id: type,
      type,
      title: title || fallback.title,
      description: description || fallback.description,
      image: fromApi?.image ? { uri: fromApi.image } : fallback.image,
    };
  });

  const handleBookPuja = item => {
    navigation.navigate('RemedyShop', { type: item.type, title: item.title });
  };
  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => handleBookPuja(item)} style={styles.card}>
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
