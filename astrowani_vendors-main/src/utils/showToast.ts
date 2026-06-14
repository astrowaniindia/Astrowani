import { ToastAndroid } from 'react-native';

export const showToastCenter = (msg: string) => {
    ToastAndroid.showWithGravity(msg, ToastAndroid.SHORT, ToastAndroid.CENTER);
};
