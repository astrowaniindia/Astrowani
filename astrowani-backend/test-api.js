const axios = require('axios');
axios.post('https://astrowani.onrender.com/api/users/mobile-otp-request', {
  phoneNumber: "1234567890",
  role: "customer"
}).then(r => console.log("SUCCESS:", r.data)).catch(e => {
  console.log("ERROR STATUS:", e.response?.status);
  console.log("ERROR DATA:", e.response?.data);
});
