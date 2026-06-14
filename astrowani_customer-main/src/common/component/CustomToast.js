import {Alert} from 'react-native';

export const CustomToast = ({type, title, message}) => {
  Alert.alert(title, message);
};