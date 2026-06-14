import React from 'react';
import { View, Text, Image, ScrollView, StyleSheet } from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import RenderHTML from 'react-native-render-html'; // Import the RenderHTML component

const BlogScreen = ({ route }) => {
  const { data = {} } = route.params || {};

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

  const cleanHTML = (html) => html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');


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
          <Text style={styles.blogTitle}>{data?.english?.title}</Text>
          <Text style={styles.blogTitle}>{data?.hindi?.title}</Text>
        </View>

        {/* Blog Content Section */}
        <View style={styles.contentView}>
          <Text style={styles.blogheadline}>{data?.english?.excerpt}</Text>
          <Text style={styles.blogheadline}>{data?.hindi?.excerpt}</Text>

          {isHTML ? (
            <RenderHTML
              contentWidth={scale(320)}
              source={{ html: cleanHTML(content) }}
              baseStyle={styles.htmlContent}
              ignoredDomTags={['style', 'script']}
            />
          ) : (
            <Text style={styles.content}>{content}</Text>
          )}

          {isHindiHTML ? (
            <RenderHTML
              contentWidth={scale(320)}
              source={{ html: cleanHTML(contentHindi) }}
              baseStyle={styles.htmlContent}
              ignoredDomTags={['style', 'script']}
            />
          ) : (
            <Text style={styles.content}>{contentHindi}</Text>
          )}


          {/* Conditional Rendering for HTML vs Plain Text */}
          {/* {isHTML ? (
            <RenderHTML
              contentWidth={scale(320)}
              source={{ html: cleanHTML(content) }}
              baseStyle={styles.htmlContent}
            />
          ) : (
            <Text style={styles.content}>{content}</Text>
          )} */}
          {/* {isHindiHTML ? (
            <RenderHTML
              contentWidth={scale(320)}
              source={{ html: cleanHTML(contentHindi) }}
              baseStyle={styles.htmlContent}
            />
          ) : (
            <Text style={styles.content}>{contentHindi}</Text>
          )} */}
        </View>
        <Text style={[styles.blogMeta, { paddingBottom: 10 }]}>Created At {formattedDate}</Text>
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
