import { OtplessHeadlessModule } from 'otpless-react-native';
import { Alert } from 'react-native';

const headlessModule = new OtplessHeadlessModule();

export const startOtpVerification = async (phoneNumber, navigation) => {
    console.log(" ======================================= startOtpVerification ======================================= ");

    if (!phoneNumber || phoneNumber.length < 10) {
        Alert.alert('Validation Error', 'Please enter a valid phone number.');
        return;
    }

    try {
        headlessModule.initHeadless('XEI0EKAE23XPDNHKAQRJ');

        const request = { phone: phoneNumber, countryCode: '+91' };
        const result = await headlessModule.startHeadless(request);

        console.log('Headless Result:', result);

        if (result?.statusCode === 200) {
            if (result.responseType === 'INITIATE') {
                console.log('OTP Sent Successfully!');
                navigation.navigate('Verify', { phone: phoneNumber, requestId: result.response.requestID });
            }
        } else {
            Alert.alert('Error', 'Failed to send OTP. Try again later.');
        }
    } catch (error) {
        console.error('Otpless Error:', error);
        Alert.alert('Error', 'Something went wrong. Please try again.');
    }
};
