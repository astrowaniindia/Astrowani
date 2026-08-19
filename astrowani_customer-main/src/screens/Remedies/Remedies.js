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

// Bundled fallback images — used whenever the admin hasn't set a category's
// image yet (or the fetch fails), so this screen never breaks or goes blank.
// See astrowani-admin's Remedies page → "Edit ... section" for the
// admin-editable version of these (table remedy_categories). Title/description
// text now comes from i18n (below), not this object — the fallback used to be
// English-only regardless of the app's language, so it stayed "Puja" /
// "Gemstones" / etc. even with the Hindi toggle on.
const IMAGE_DEFAULTS = {
  puja: require('../../assets/images/specificPuja.jpg'),
  gemstone: require('../../assets/images/gemsStones.jpg'),
  specific_puja: require('../../assets/images/groupPuja.jpg'),
  life_report: require('../../assets/images/specificPuja.jpg'),
};
// Maps each category type to its i18n key pair.
const TEXT_KEYS = {
  puja: {title: 'remedies.puja.title', description: 'remedies.puja.description'},
  gemstone: {title: 'remedies.gemstone.title', description: 'remedies.gemstone.description'},
  specific_puja: {title: 'remedies.specificPuja.title', description: 'remedies.specificPuja.description'},
  life_report: {title: 'remedies.lifeReport.title', description: 'remedies.lifeReport.description'},
};
const ORDER = ['puja', 'gemstone', 'specific_puja', 'life_report'];

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

  // Merge admin-set fields over the bundled fallback, per type, in the fixed
  // display order — an admin can set only some fields (e.g. just the image) and
  // the rest still falls back cleanly. The fallback text is now translated
  // (TEXT_KEYS via t()), not a fixed English string, so a category the admin
  // hasn't filled in yet still respects the Hindi toggle.
  const data = ORDER.map((type) => {
    const keys = TEXT_KEYS[type];
    const fallbackTitle = t(keys.title);
    const fallbackDescription = t(keys.description);
    const fromApi = (categories || []).find((c) => c.type === type);
    // Precedence matters, and getting it wrong is why this screen stayed English
    // under the Hindi toggle (reported 2026-08-19). It used to read:
    //
    //   language === 'Hindi' ? (fromApi?.hindi?.title || fromApi?.title) : ...
    //
    // so as soon as an admin had saved an English title — which they had for
    // every category — the Hindi branch fell straight through to that English
    // string. Being truthy, it then satisfied the `title || fallbackTitle` below,
    // so the perfectly good bundled Hindi translation was never reached.
    //
    // Correct order in Hindi is: admin's Hindi > our bundled Hindi > admin's
    // English as an absolute last resort (better a real category name than a
    // blank card). English is unchanged: admin's text, else the bundled string.
    const pick = (apiHindi, apiEnglish, bundled) =>
      language === 'Hindi'
        ? (apiHindi || bundled || apiEnglish)
        : (apiEnglish || bundled);
    const title = pick(fromApi?.hindi?.title, fromApi?.title, fallbackTitle);
    const description = pick(fromApi?.hindi?.description, fromApi?.description, fallbackDescription);
    return {
      id: type,
      type,
      title: title || fallbackTitle,
      description: description || fallbackDescription,
      image: fromApi?.image ? { uri: fromApi.image } : IMAGE_DEFAULTS[type],
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
