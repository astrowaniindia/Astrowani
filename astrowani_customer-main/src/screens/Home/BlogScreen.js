import React from 'react';
import { View, Text, Image, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import RenderHTML from 'react-native-render-html'; // Import the RenderHTML component
import { LanguageContext } from '../../context/LanguageContext';

// Reset every tag to the same readable typography, no matter what formatting the
// admin's rich-text editor baked into the pasted HTML (borders, monospace, etc.).
const HTML_TAGS_STYLES = {
  body: { fontFamily: 'Lato-Regular', color: COLORS.black },
  p: { fontFamily: 'Lato-Regular', fontSize: moderateScale(15), lineHeight: verticalScale(24), marginBottom: verticalScale(10) },
  div: { fontFamily: 'Lato-Regular', fontSize: moderateScale(15), lineHeight: verticalScale(24) },
  span: { fontFamily: 'Lato-Regular', fontSize: moderateScale(15) },
  li: { fontFamily: 'Lato-Regular', fontSize: moderateScale(15), lineHeight: verticalScale(24) },
  h1: { fontFamily: 'Lato-Bold', fontSize: moderateScale(20), marginBottom: verticalScale(10) },
  h2: { fontFamily: 'Lato-Bold', fontSize: moderateScale(18), marginBottom: verticalScale(8) },
  h3: { fontFamily: 'Lato-Bold', fontSize: moderateScale(16), marginBottom: verticalScale(8) },
  strong: { fontFamily: 'Lato-Bold' },
  b: { fontFamily: 'Lato-Bold' },
};

const BlogScreen = ({ route }) => {
  const { t } = React.useContext(LanguageContext);
  const { data = {} } = route.params || {};
  const { width } = useWindowDimensions();

  // console.log("data:", data);


  const thumbnail = data.thumbnail || 'https://via.placeholder.com/150';
  const title = data.title || 'No title';
  const metaDescription = data.metaDescription || 'No description available';
  const content = data?.english?.content || '<p>Content not available.</p>'; // Assuming content might be HTML
  const contentHindi = data?.hindi?.content || '<p>Content not available.</p>'; // Assuming content might be HTML
  const excerpt = data.excerpt || 'No excerpt available.';

  const date = data.createdAt ? new Date(data.createdAt) : new Date();
  const formattedDate = date.toLocaleDateString();

  // Simple check for HTML content; you might need a more robust check depending on your use case
  const isHTML = /<\/?[a-z][\s\S]*>/i.test(content);

  const isHindiHTML = /<\/?[a-z][\s\S]*>/i.test(contentHindi);

  // Strip <style> blocks, inline style="" attributes, and pre/code tags (some blog content is
  // pasted from rich-text editors with inline monospace/bordered styling baked in) so every
  // blog renders with consistent, readable typography regardless of how the admin authored it.
  const cleanHTML = (html) => html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\sstyle="[^"]*"/gi, '')
    .replace(/<\/?(pre|code)[^>]*>/gi, '');


  return (
    <View style={styles.container}>
      <ScrollView>
        {/* Image Section with Default Image */}
        <Image source={{ uri: thumbnail }} style={styles.imageBackground} />

        {/* Guidance Section */}
        <View style={styles.guidanceContainer}>
          <Text style={styles.guidanceSubtitle}>{data?.english?.metaDescription}</Text>
          <Text style={styles.guidanceSubtitle}>{data?.hindi?.metaDescription}</Text>
        </View>

        {/* Blog Description Section */}
        <View style={styles.blogDescriptionContainer}>
          <Text style={styles.langLabel}>English</Text>
          <Text style={styles.blogTitle}>{data?.english?.title}</Text>
        </View>

        {/* Blog Content Section */}
        <View style={styles.contentView}>
          <Text style={styles.blogheadline}>{data?.english?.excerpt}</Text>

          {isHTML ? (
            <RenderHTML
              contentWidth={width - moderateScale(30)}
              source={{ html: cleanHTML(content) }}
              baseStyle={styles.htmlContent}
              tagsStyles={HTML_TAGS_STYLES}
              ignoredDomTags={['style', 'script']}
            />
          ) : (
            <Text style={styles.content}>{content}</Text>
          )}

          <View style={styles.langDivider} />
          <Text style={styles.langLabel}>हिन्दी</Text>
          <Text style={styles.blogTitle}>{data?.hindi?.title}</Text>
          <Text style={styles.blogheadline}>{data?.hindi?.excerpt}</Text>

          {isHindiHTML ? (
            <RenderHTML
              contentWidth={width - moderateScale(30)}
              source={{ html: cleanHTML(contentHindi) }}
              baseStyle={styles.htmlContent}
              tagsStyles={HTML_TAGS_STYLES}
              ignoredDomTags={['style', 'script']}
            />
          ) : (
            <Text style={styles.content}>{contentHindi}</Text>
          )}
        </View>
        <Text style={[styles.blogMeta, { paddingBottom: 10 }]}>{t('blog.createdAt', { date: formattedDate })}</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  imageBackground: {
    width: '100%',
    height: verticalScale(200),
  },
  guidanceContainer: {
    padding: scale(20),
    backgroundColor: '#FEECEC',
    alignItems: 'center',
  },
  guidanceSubtitle: {
    fontSize: moderateScale(15),
    color: COLORS.gray,
    fontFamily: 'Lato-Bold',
    marginBottom: verticalScale(20),
  },
  blogDescriptionContainer: {
    padding: scale(20),
    alignItems: 'center',
  },
  langLabel: {
    fontSize: moderateScale(11),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: verticalScale(6),
  },
  langDivider: {
    height: 1,
    backgroundColor: COLORS.lightBorder,
    marginVertical: verticalScale(20),
  },
  blogTitle: {
    fontSize: moderateScale(19),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: verticalScale(10),
  },
  blogMeta: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: COLORS.gray,
  },
  blogheadline: {
    color: COLORS.black,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(18),
    marginVertical: verticalScale(15),
  },
  contentView: {
    padding: moderateScale(15),
  },
  content: {
    color: COLORS.black,
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(15),
  },
  htmlContent: {
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(15),
    color: COLORS.black,
  },
});

export default BlogScreen;
