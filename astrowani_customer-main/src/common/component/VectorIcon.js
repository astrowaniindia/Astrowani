import React from 'react';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const VectorIcon = ({type, name, size, color, ...props}) => {
  if (type === 'Ionicons') {
    return <Ionicons name={name} size={size} color={color} {...props} />;
  } else if (type === 'MaterialCommunityIcons') {
    return <MaterialCommunityIcons name={name} size={size} color={color} {...props} />;
  } else if (type === 'MaterialIcons') {
    return <MaterialIcons name={name} size={size} color={color} {...props} />;
  }
  return null;
};

export default VectorIcon;