import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import RenderHTML from 'react-native-render-html';
import { LanguageContext } from '../../context/LanguageContext';

const HTML_TAGS_STYLES = {
  body: { fontFamily: 'Lato-Regular', color: '#333333' },
  p: {
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(15),
    lineHeight: verticalScale(24),
    marginBottom: verticalScale(10),
    color: '#333333',
  },
  div: {
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(15),
    lineHeight: verticalScale(24),
    color: '#333333',
  },
  span: { fontFamily: 'Lato-Regular', fontSize: moderateScale(15), color: '#333333' },
  li: {
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(15),
    lineHeight: verticalScale(24),
    color: '#333333',
  },
  h1: { fontFamily: 'Lato-Bold', fontSize: moderateScale(20), color: '#1A1A1A', marginBottom: verticalScale(10) },
  h2: { fontFamily: 'Lato-Bold', fontSize: moderateScale(18), color: '#1A1A1A', marginBottom: verticalScale(8) },
  h3: { fontFamily: 'Lato-Bold', fontSize: moderateScale(16), color: '#1A1A1A', marginBottom: verticalScale(8) },
  strong: { fontFamily: 'Lato-Bold', color: '#1A1A1A' },
  b: { fontFamily: 'Lato-Bold', color: '#1A1A1A' },
};

const cleanHTML = (html) =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\sstyle="[^"]*"/gi, '')
    .replace(/<\/?(pre|code)[^>]*>/gi, '');

const BlogScreen = ({ route }) => {
  const { language } = React.useContext(LanguageContext);
  const { data = {} } = route.params || {};
  const { width } = useWindowDimensions();

  const hasHindi = !!(data?.hindi?.title || data?.hindi?.content);
  const hasEnglish = !!(data?.english?.title || data?.english?.content || data?.title);

  const initialLang = language === 'Hindi' && hasHindi ? 'hi' : 'en';
  const [activeLang, setActiveLang] = useState(initialLang);

  const category = data.category?.name;
  const date = data.createdAt ? new Date(data.createdAt) : new Date();
  const formattedDate = date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const title =
    activeLang === 'hi'
      ? data?.hindi?.title || data?.title || 'No title'
      : data?.english?.title || data?.title || 'No title';

  const metaDesc =
    activeLang === 'hi'
      ? data?.hindi?.metaDescription || data?.metaDescription || ''
      : data?.english?.metaDescription || data?.metaDescription || '';

  const excerpt =
    activeLang === 'hi'
      ? data?.hindi?.excerpt || data?.excerpt || ''
      : data?.english?.excerpt || data?.excerpt || '';

  const rawContent =
    activeLang === 'hi'
      ? data?.hindi?.content || '<p>Content not available.</p>'
      : data?.english?.content || '<p>Content not available.</p>';

  const isHTML = /<\/?[a-z][\s\S]*>/i.test(rawContent);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero image */}
        {data.thumbnail ? (
          <Image source={{ uri: data.thumbnail }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={styles.heroImagePlaceholder} />
        )}

        <View style={styles.body}>
          {/* Category badge + date */}
          <View style={styles.metaRow}>
            {category ? (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{category}</Text>
              </View>
            ) : (
              <View />
            )}
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Meta description */}
          {metaDesc ? <Text style={styles.metaDesc}>{metaDesc}</Text> : null}

          {/* Language switcher — only shown when both languages are available */}
          {hasEnglish && hasHindi ? (
            <View style={styles.langTabRow}>
              <TouchableOpacity
                style={[styles.langTab, activeLang === 'en' && styles.langTabActive]}
                onPress={() => setActiveLang('en')}
                activeOpacity={0.8}
              >
                <Text style={[styles.langTabText, activeLang === 'en' && styles.langTabTextActive]}>
                  English
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langTab, activeLang === 'hi' && styles.langTabActive]}
                onPress={() => setActiveLang('hi')}
                activeOpacity={0.8}
              >
                <Text style={[styles.langTabText, activeLang === 'hi' && styles.langTabTextActive]}>
                  हिन्दी
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.divider} />

          {/* Excerpt / intro line */}
          {excerpt ? <Text style={styles.excerpt}>{excerpt}</Text> : null}

          {/* Main content */}
          {isHTML ? (
            <RenderHTML
              contentWidth={width - scale(32)}
              source={{ html: cleanHTML(rawContent) }}
              baseStyle={styles.htmlContent}
              tagsStyles={HTML_TAGS_STYLES}
              ignoredDomTags={['style', 'script']}
            />
          ) : (
            <Text style={styles.plainContent}>{rawContent}</Text>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerDate}>Published {formattedDate}</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  heroImage: {
    width: '100%',
    height: verticalScale(220),
    backgroundColor: '#E8E8E8',
  },
  heroImagePlaceholder: {
    width: '100%',
    height: verticalScale(120),
    backgroundColor: '#E8E8E8',
  },
  body: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(18),
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(12),
  },
  categoryBadge: {
    backgroundColor: '#FEF0F0',
    borderRadius: moderateScale(4),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
  },
  categoryBadgeText: {
    fontSize: moderateScale(10),
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
    color: '#999999',
  },
  title: {
    fontSize: moderateScale(22),
    fontFamily: 'Lato-Bold',
    color: '#1A1A1A',
    lineHeight: moderateScale(30),
    marginBottom: verticalScale(8),
  },
  metaDesc: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#666666',
    lineHeight: moderateScale(21),
    marginBottom: verticalScale(14),
  },
  langTabRow: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F2',
    borderRadius: moderateScale(8),
    padding: moderateScale(3),
    alignSelf: 'flex-start',
    marginBottom: verticalScale(4),
  },
  langTab: {
    paddingHorizontal: scale(18),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(6),
  },
  langTabActive: {
    backgroundColor: COLORS.AstroMaroon,
  },
  langTabText: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
    color: '#888888',
  },
  langTabTextActive: {
    color: COLORS.white,
  },
  divider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: verticalScale(16),
  },
  excerpt: {
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Regular',
    color: '#444444',
    lineHeight: moderateScale(23),
    marginBottom: verticalScale(14),
  },
  htmlContent: {
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(15),
    color: '#333333',
    lineHeight: moderateScale(24),
  },
  plainContent: {
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(15),
    color: '#333333',
    lineHeight: moderateScale(24),
  },
  footer: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(30),
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    marginTop: verticalScale(16),
    alignItems: 'center',
  },
  footerDate: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
    color: '#AAAAAA',
  },
});

export default BlogScreen;
