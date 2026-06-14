import React, {useRef, useState, useEffect} from 'react';
import {
  StyleSheet,
  View,
  Image,
  FlatList,
  Dimensions,
  Animated,
  TouchableOpacity,
} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
const {width} = Dimensions.get('window');

const IMAGE_SLIDE_INTERVAL = 4000;

const ImageSlider = ({data, imageStyle}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const intervalId = setInterval(() => {
      const nextIndex = (currentIndex + 1) % data.length;
      flatListRef.current.scrollToIndex({index: nextIndex, animated: true});
      setCurrentIndex(nextIndex);
    }, IMAGE_SLIDE_INTERVAL);

    return () => clearInterval(intervalId);
  }, [currentIndex, data.length]);

  const onViewableItemsChanged = useRef(({viewableItems}) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  });

  const renderItem = ({item}) => (
    <View style={styles.imageContainer}>
      <Image source={{uri: item.image}} style={[styles.image, imageStyle]} />
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={data}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) => index.toString()}
        renderItem={renderItem}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
        }}
        onScroll={Animated.event(
          [{nativeEvent: {contentOffset: {x: scrollX}}}],
          {useNativeDriver: false},
        )}
      />
      <View style={styles.pagination}>
        {data.map((_, i) => (
          <View
            key={i.toString()}
            style={[styles.dot, currentIndex === i && styles.activeDot]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: verticalScale(170),
  },
  imageContainer: {
    width: width - 32,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: scale(15),
  },
  image: {
    width: '100%',
    height: '72%',
    resizeMode: 'cover',
    borderRadius: moderateScale(10),
  },
  pagination: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: verticalScale(10),
    alignSelf: 'center',
  },
  dot: {
    height: scale(6),
    width: scale(6),
    borderRadius: moderateScale(3),
    backgroundColor: COLORS.white,
    marginHorizontal: scale(4),
  },
  activeDot: {
    backgroundColor: COLORS.AstroMaroon,
  },
});

export default ImageSlider;
