const axios = require('axios');

async function testAuthFlow() {
  const baseURL = 'https://astrowani.onrender.com';
  const phoneNumber = '7877724833'; // Using Ansh Sharma's number from test_supabase

  console.log('1. Requesting OTP...');
  try {
    const reqRes = await axios.post(`${baseURL}/api/users/mobile-otp-request`, {
      phoneNumber,
      role: 'customer'
    });
    console.log('OTP Request Success:', reqRes.data);

    // The mock backend returns the OTP in console, but wait: since we don't have console access of Render,
    // let's look at what the backend does for OTP verify:
    // In our backend code, if ENABLEX is not configured, it logs the OTP to console.
    // Wait, is there a way to verify without OTP or is there a bypass/fixed OTP?
    // Let's check otpStore in index.js. It's stored in-memory on the Render server.
    // Since we don't know the generated OTP, wait!
    // Can we write a script that inspects or queries the database or does something else?
    // Or does the backend allow a default OTP for testing?
    // Let's check the verify endpoint to see if there is any override.
    // In index.js line 320:
    // if (storedData.otp !== otp.toString()) { return res.status(400)... }
    // There is no override.
  } catch (err) {
    console.error('OTP Request failed:', err.response?.data || err.message);
  }
}

testAuthFlow();
