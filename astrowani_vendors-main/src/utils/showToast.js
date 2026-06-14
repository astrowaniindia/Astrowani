import { ToastAndroid } from 'react-native';

// Function to show toast
const showToast = (message) => {
    ToastAndroid.show(message, ToastAndroid.SHORT);
};

export default showToast;
