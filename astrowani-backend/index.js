require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const axios = require('axios');

const app = express();
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('A user connected via Socket.io:', socket.id);

  socket.on('join_room', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their personal room.`);
  });

  socket.on('initiate_call', (data) => {
    console.log('Incoming call to:', data.astrologer_id);
    io.to(data.astrologer_id).emit('incoming_call', data);
  });

  socket.on('accept_call', (data) => {
    console.log('Call accepted by vendor, notifying customer:', data.customer_id);
    io.to(data.customer_id).emit('call_accepted', data);
  });

  socket.on('reject_call', (data) => {
    console.log('Call rejected by vendor, notifying customer:', data.customer_id);
    io.to(data.customer_id).emit('call_rejected', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 4500;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_astrowani_key_123';

// In-memory store for OTPs (In production, use Redis or Database)
const otpStore = new Map();

// EnableX Credentials (add these to your .env file)
const ENABLEX_APP_ID = process.env.ENABLEX_APP_ID;
const ENABLEX_APP_KEY = process.env.ENABLEX_APP_KEY;

/**
 * Endpoint to request an OTP
 */
app.post('/api/users/mobile-otp-request', async (req, res) => {
  const { phoneNumber, role } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: 'Phone number is required' });
  }

  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const sessionId = Date.now().toString(); // Simple session ID

  // Store the OTP
  otpStore.set(phoneNumber, {
    otp,
    sessionId,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes expiry
  });

  console.log(`Generated OTP for ${phoneNumber}: ${otp} (Session: ${sessionId})`);

  // TODO: Send OTP via EnableX SMS API
  if (ENABLEX_APP_ID && ENABLEX_APP_KEY) {
    try {
      // Encode credentials for Basic Auth
      const authHeader = Buffer.from(`${ENABLEX_APP_ID}:${ENABLEX_APP_KEY}`).toString('base64');
      
      // EnableX SMS API Payload (adjust according to your EnableX campaign template)
      const payload = {
        type: "sms",
        data: {
          to: [phoneNumber], // Ensure phoneNumber has country code if required by EnableX
          from: "ASTROWANI", // Your registered sender ID
          message: `Your Astrowani login OTP is ${otp}. It is valid for 5 minutes.`
        }
      };

      // Uncomment this to make the actual API call when keys are ready
      await axios.post('https://api.enablex.io/sms/v1/messages', payload, {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('EnableX SMS sent successfully');
    } catch (error) {
      console.error('Failed to send SMS via EnableX:', error?.response?.data || error.message);
      // Even if SMS fails, you might want to return an error, but for testing we continue
    }
  } else {
    console.log('EnableX keys not configured. Skipping actual SMS sending. OTP is:', otp);
  }

  // Return success to the app
  return res.status(200).json({
    success: true,
    message: 'OTP sent successfully',
    result: {
      Details: sessionId, // This maps to response.data.result.Details in Login.js
    }
  });
});

/**
 * Endpoint to verify an OTP
 */
app.post('/api/users/mobile-otp-verify', async (req, res) => {
  const { phoneNumber, otp, fcmToken, role } = req.body;

  if (!phoneNumber || !otp) {
    return res.status(400).json({ success: false, message: 'Phone number and OTP are required' });
  }

  const storedData = otpStore.get(phoneNumber);

  if (!storedData) {
    return res.status(400).json({ success: false, message: 'No OTP requested for this number' });
  }

  if (Date.now() > storedData.expiresAt) {
    otpStore.delete(phoneNumber);
    return res.status(400).json({ success: false, message: 'OTP has expired' });
  }

  if (storedData.otp !== otp.toString()) {
    return res.status(400).json({ success: false, message: 'Invalid OTP' });
  }

  // OTP is valid!
  otpStore.delete(phoneNumber); // Clear OTP after successful use

  // Look up or create the customer in Supabase to get the real UUID
  let supabaseCustomerId = null;
  try {
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, name')
      .eq('mobile', phoneNumber)
      .single();
    
    if (existingCustomer) {
      supabaseCustomerId = existingCustomer.id;
    } else {
      // Create a new customer row
      const { data: newCustomer } = await supabase
        .from('customers')
        .insert([{ mobile: phoneNumber, wallet_balance: 0 }])
        .select('id')
        .single();
      supabaseCustomerId = newCustomer?.id;
    }
  } catch (e) {
    console.warn('Could not look up Supabase customer:', e.message);
  }

  // Generate JWT token with the real Supabase UUID
  const token = jwt.sign(
    { id: supabaseCustomerId || `user_${Date.now()}`, userId: supabaseCustomerId, phone: phoneNumber, role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  console.log(`User ${phoneNumber} logged in successfully. Supabase ID: ${supabaseCustomerId}`);

  // Return token to the app
  return res.status(200).json({
    success: true,
    message: 'OTP verified successfully',
    token: token,
    user: { id: supabaseCustomerId || `user_${Date.now()}`, phoneNumber, role }
  });
});

/**
 * Endpoint for Email OTP Request (Placeholder)
 */
app.post('/api/users/login-with-email', (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Email OTP flow not fully implemented in this backend yet',
  });
});

app.get('/', (req, res) => {
  res.send('Astrowani Backend API is running!');
});

// ==========================================
// MOCK ENDPOINTS TO PREVENT 404 CRASHES
// ==========================================

// Mock User Profile
app.get('/api/users/profile', (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test User",
      email: "testuser@example.com",
      phone: "+919999999999",
      profilePic: ""
    }
  });
});

// Mock Banners
app.get('/api/banners/all', (req, res) => {
  return res.status(200).json({
    data: [
      { id: 1, title: 'Chat With Premium Astrologers', description: 'Get 50% Off on Your First Call', imageUrl: 'https://astrowani.onrender.com/public/images/banner1.jpeg' },
      { id: 2, title: 'Live Astrologer Session', description: 'Ask your queries live now!', imageUrl: 'https://astrowani.onrender.com/public/images/banner2.jpeg' }
    ]
  });
});

// Mock Thoughts
app.get('/api/thoughts/latest', (req, res) => {
  return res.status(200).json({ thoughtText: "Welcome to Astrowani!" });
});

// Mock Categories
app.get('/api/categories', (req, res) => {
  return res.status(200).json({
    categories: [
      { _id: 'cat_1', name: 'All', image: 'https://astrowani.onrender.com/public/images/cat_all.png' },
      { _id: 'cat_2', name: 'Love', image: 'https://astrowani.onrender.com/public/images/cat_love.png' },
      { _id: 'cat_3', name: 'Career', image: 'https://astrowani.onrender.com/public/images/cat_career.png' },
      { _id: 'cat_4', name: 'Marriage', image: 'https://astrowani.onrender.com/public/images/cat_marriage.png' }
    ]
  });
});

// Mock Blogs
app.get('/api/blogs', (req, res) => {
  return res.status(200).json({ data: [] });
});

const MOCK_ASTROLOGERS = [
  { _id: 1, userId: "astro_1", name: 'Aacharya Sharma', profileImage: 'https://astrowani.onrender.com/public/images/astro1.png', chargePerMinute: 15, isFree: false, specialties: [{name: 'Vedic Astrology'}], experience: 10, language: ['English', 'Hindi'], rating: 4.8 },
  { _id: 2, userId: "astro_2", name: 'Guruji Verma', profileImage: 'https://astrowani.onrender.com/public/images/astro2.png', chargePerMinute: 20, isFree: false, specialties: [{name: 'Tarot Card'}], experience: 8, language: ['Hindi'], rating: 4.9 },
  { _id: 3, userId: "astro_3", name: 'Pandit Shastri', profileImage: 'https://astrowani.onrender.com/public/images/astro3.png', chargePerMinute: 10, isFree: true, specialties: [{name: 'Numerology'}], experience: 5, language: ['English'], rating: 4.5 },
  { _id: 4, userId: "astro_4", name: 'Swami Raj', profileImage: 'https://astrowani.onrender.com/public/images/astro4.png', chargePerMinute: 25, isFree: false, specialties: [{name: 'Vastu Shastra'}], experience: 15, language: ['Hindi', 'Sanskrit'], rating: 5.0 },
  { _id: 5, userId: "astro_5", name: 'Yogi Patel', profileImage: 'https://astrowani.onrender.com/public/images/astro1.png', chargePerMinute: 12, isFree: false, specialties: [{name: 'Palmistry'}], experience: 6, language: ['English', 'Gujarati'], rating: 4.7 },
  { _id: 6, userId: "astro_6", name: 'Astrologer Gupta', profileImage: 'https://astrowani.onrender.com/public/images/astro2.png', chargePerMinute: 30, isFree: false, specialties: [{name: 'Prashna Kundali'}], experience: 12, language: ['Hindi'], rating: 4.6 },
  { _id: 7, userId: "astro_7", name: 'Rishi Kumar', profileImage: 'https://astrowani.onrender.com/public/images/astro3.png', chargePerMinute: 18, isFree: true, specialties: [{name: 'Nadi Astrology'}], experience: 9, language: ['English', 'Tamil'], rating: 4.9 },
  { _id: 8, userId: "astro_8", name: 'Devi Singh', profileImage: 'https://astrowani.onrender.com/public/images/astro4.png', chargePerMinute: 22, isFree: false, specialties: [{name: 'Face Reading'}], experience: 11, language: ['Hindi', 'Punjabi'], rating: 4.8 },
];

// Mock Astrologers
app.get('/api/astrologers', async (req, res) => {
  try {
    const { data, error } = await supabase.from('astrologers').select('*');
    if (error) throw error;
    
    const formattedData = data.map((astro, index) => ({
      _id: astro.id,
      userId: astro.id,
      name: `${astro.first_name} ${astro.last_name}`,
      profileImage: astro.profile_pic || `https://astrowani.onrender.com/public/images/astro${(index % 4) + 1}.png`,
      chargePerMinute: astro.pricing || 15,
      isFree: false,
      specialties: [{ name: 'Vedic Astrology' }], // Defaulting for now
      experience: astro.experience || 5,
      language: astro.languages || ['Hindi', 'English'],
      rating: 4.8,
    }));
    
    // Combine real astrologers with mock ones
    return res.status(200).json({ data: [...formattedData, ...MOCK_ASTROLOGERS] });
  } catch (err) {
    console.error(err);
    return res.status(200).json({ data: MOCK_ASTROLOGERS });
  }
});

app.get('/api/astrologers/specialty/:id', (req, res) => {
  return res.status(200).json({
    data: [
      { _id: 1, userId: "astro_1", name: 'Aacharya Sharma', profileImage: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png', chargePerMinute: 15, isFree: false, specialties: [{name: 'Vedic Astrology'}], experience: 10, language: ['English', 'Hindi'], rating: 4.8 },
      { _id: 2, userId: "astro_2", name: 'Guruji Verma', profileImage: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png', chargePerMinute: 20, isFree: false, specialties: [{name: 'Tarot Card'}], experience: 8, language: ['Hindi'], rating: 4.9 },
    ]
  });
});

// Mock Live Astrologers
app.get('/api/astrologers/liveAstrologers', (req, res) => {
  return res.status(200).json({
    data: [
      { _id: 1, userId: "astro_1", name: 'Aacharya Sharma', profileImage: 'https://astrowani.onrender.com/public/images/astro1.png', chargePerMinute: 15, isFree: false, specialties: [{name: 'Vedic Astrology'}], experience: 10, language: ['English', 'Hindi'], rating: 4.8 },
      { _id: 2, userId: "astro_2", name: 'Guruji Verma', profileImage: 'https://astrowani.onrender.com/public/images/astro2.png', chargePerMinute: 20, isFree: false, specialties: [{name: 'Tarot Card'}], experience: 8, language: ['Hindi'], rating: 4.9 },
      { _id: 3, userId: "astro_3", name: 'Pandit Shastri', profileImage: 'https://astrowani.onrender.com/public/images/astro3.png', chargePerMinute: 10, isFree: true, specialties: [{name: 'Numerology'}], experience: 5, language: ['English'], rating: 4.5 },
      { _id: 4, userId: "astro_4", name: 'Swami Raj', profileImage: 'https://astrowani.onrender.com/public/images/astro4.png', chargePerMinute: 25, isFree: false, specialties: [{name: 'Vastu Shastra'}], experience: 15, language: ['Hindi', 'Sanskrit'], rating: 5.0 },
      { _id: 5, userId: "astro_5", name: 'Yogi Patel', profileImage: 'https://astrowani.onrender.com/public/images/astro1.png', chargePerMinute: 12, isFree: false, specialties: [{name: 'Palmistry'}], experience: 6, language: ['English', 'Gujarati'], rating: 4.7 },
      { _id: 6, userId: "astro_6", name: 'Astrologer Gupta', profileImage: 'https://astrowani.onrender.com/public/images/astro2.png', chargePerMinute: 30, isFree: false, specialties: [{name: 'Prashna Kundali'}], experience: 12, language: ['Hindi'], rating: 4.6 },
      { _id: 7, userId: "astro_7", name: 'Rishi Kumar', profileImage: 'https://astrowani.onrender.com/public/images/astro3.png', chargePerMinute: 18, isFree: true, specialties: [{name: 'Nadi Astrology'}], experience: 9, language: ['English', 'Tamil'], rating: 4.9 },
      { _id: 8, userId: "astro_8", name: 'Devi Singh', profileImage: 'https://astrowani.onrender.com/public/images/astro4.png', chargePerMinute: 22, isFree: false, specialties: [{name: 'Face Reading'}], experience: 11, language: ['Hindi', 'Punjabi'], rating: 4.8 },
    ]
  });
});

// Mock Reviews list by astrologer
app.get('/api/reviews/astrologer/:id', (req, res) => {
  return res.status(200).json([
    {
      user: { firstName: 'Demo User' },
      rating: 5,
      comment: 'This astrologer is great!',
      createdAt: new Date().toISOString()
    }
  ]);
});

// Mock Favorite Astrologers
app.get('/api/favoriteAstrologer', (req, res) => {
  return res.status(200).json({ favoriteAstrologer: [] });
});

app.post('/api/favoriteAstrologer/add', (req, res) => {
  return res.status(200).json({ success: true, message: 'Added to favorites' });
});

app.post('/api/favoriteAstrologer/remove', (req, res) => {
  return res.status(200).json({ success: true, message: 'Removed from favorites' });
});

// Mock Average Rating
app.get('/api/reviews/astrologer/:id/average-rating', (req, res) => {
  return res.status(200).json({ averageRating: 4.8, totalReviews: 120 });
});

// Post a review
app.post('/api/reviews/astrologer/:id/review', (req, res) => {
  return res.status(200).json({ success: true, message: 'Review added successfully' });
});

// Mock Reviews all
app.get('/api/reviews/astrologers/reviews', (req, res) => {
  return res.status(200).json([]);
});

// Create EnableX Room
const createEnxRoom = async () => {
  const authHeader = Buffer.from(`${ENABLEX_APP_ID}:${ENABLEX_APP_KEY}`).toString('base64');
  const response = await axios.post('https://api.enablex.io/video/v2/rooms', {
    name: "Astrowani Room",
    owner_ref: "astro_backend",
    settings: {
      description: "Astrology consultation",
      mode: "group",
      scheduled: false,
      adhoc: true,
      participants: 2,
      duration: 60,
      quality: "SD",
      auto_recording: false
    }
  }, {
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data.room.room_id;
};

// Create EnableX Token
const createEnxToken = async (roomId, name, role, userRef) => {
  const authHeader = Buffer.from(`${ENABLEX_APP_ID}:${ENABLEX_APP_KEY}`).toString('base64');
  const response = await axios.post(`https://api.enablex.io/video/v2/rooms/${roomId}/tokens`, {
    name: name,
    role: role,
    user_ref: userRef
  }, {
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data.token;
};

// Real Call Initiate using EnableX
app.post('/api/call/initiate', async (req, res) => {
  try {
    const { name, callerRole } = req.body;
    
    // Create Room
    const roomId = await createEnxRoom();
    
    // Create Token for the caller
    const token = await createEnxToken(roomId, name || "User", "participant", "user_ref_123");
    
    // Create Token for the vendor
    const vendorToken = await createEnxToken(roomId, "Astrologer", "participant", "astro_ref_123");
    
    return res.status(200).json({
      data: {
        token: { token: token },
        vendorToken: vendorToken,
        receiver: { name: 'Astrologer', image: '' },
        sessionId: 'session_' + Date.now(),
        roomId: roomId,
      }
    });
  } catch (error) {
    console.error("Error creating ENX room/token", error?.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Failed to initiate call" });
  }
});

// Mock Gemstones
app.get('/api/astro-services/gemstones', (req, res) => {
  return res.status(200).json({
    totalPages: 1,
    gemstones: [
      { _id: 'gem_1', name: 'Ruby', price: 5000, images: ['https://cdn-icons-png.flaticon.com/512/11264/11264366.png'] },
      { _id: 'gem_2', name: 'Emerald', price: 8000, images: ['https://cdn-icons-png.flaticon.com/512/11264/11264366.png'] },
      { _id: 'gem_3', name: 'Sapphire', price: 12000, images: ['https://cdn-icons-png.flaticon.com/512/11264/11264366.png'] },
      { _id: 'gem_4', name: 'Pearl', price: 2000, images: ['https://cdn-icons-png.flaticon.com/512/11264/11264366.png'] }
    ]
  });
});

// Mock Gemstone Query
app.post('/api/astro-services/gemstone-query', (req, res) => {
  return res.status(200).json({ success: true, message: 'Query submitted successfully' });
});

// ─────────────────────────────────────────────────────────────────────────────
// WALLET: Get customer wallet balance + transactions
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/wallet', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId || decoded._id || decoded.id;

    const { data: user, error } = await supabase
      .from('customers')
      .select('wallet_balance')
      .eq('id', userId)
      .single();

    if (error) throw error;

    // Fetch recent wallet transactions
    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    return res.status(200).json({
      success: true,
      data: {
        balance: user?.wallet_balance ?? 0,
        transactions: (txns || []).map(t => ({
          id: t.id,
          description: t.description || (t.type === 'credit' ? 'Money Added' : 'Chat/Call Charge'),
          amount: t.type === 'credit' ? t.amount : -t.amount,
          date: new Date(t.created_at).toLocaleDateString('en-IN'),
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/wallet error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch wallet' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WALLET: Deduct from customer AND credit to vendor (called every minute during chat/call)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/wallet/deduct-and-credit', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId || decoded._id || decoded.id;

    const { sessionId, requestId, amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    // 1. Get current customer balance
    const { data: userRow, error: userErr } = await supabase
      .from('customers')
      .select('wallet_balance')
      .eq('id', userId)
      .single();

    if (userErr) throw userErr;

    const currentBalance = userRow?.wallet_balance ?? 0;
    if (currentBalance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    // 2. Deduct from customer
    const { error: deductErr } = await supabase
      .from('customers')
      .update({ wallet_balance: currentBalance - amount })
      .eq('id', userId);
    if (deductErr) throw deductErr;

    // 3. Log customer deduction transaction
    await supabase.from('wallet_transactions').insert([{
      user_id: userId,
      type: 'debit',
      amount: amount,
      description: 'Chat/Call charge (per minute)',
      session_id: sessionId,
      request_id: requestId,
    }]);

    // 4. Find vendor from chat_sessions
    const { data: sessionRow, error: sessErr } = await supabase
      .from('chat_sessions')
      .select('vendor_id')
      .eq('id', sessionId)
      .single();

    if (!sessErr && sessionRow?.vendor_id) {
      const vendorId = sessionRow.vendor_id;

      // 5. Get vendor current wallet balance (from astrologers table)
      const { data: astroRow } = await supabase
        .from('astrologers')
        .select('wallet_balance, today_earnings, total_earnings')
        .eq('id', vendorId)
        .single();

      const vendorBalance = astroRow?.wallet_balance ?? 0;
      const todayEarnings = astroRow?.today_earnings ?? 0;
      const totalEarnings = astroRow?.total_earnings ?? 0;

      // 6. Credit vendor wallet
      await supabase
        .from('astrologers')
        .update({
          wallet_balance: vendorBalance + amount,
          today_earnings: todayEarnings + amount,
          total_earnings: totalEarnings + amount,
        })
        .eq('id', vendorId);

      // 7. Log vendor credit transaction
      await supabase.from('vendor_wallet_transactions').insert([{
        vendor_id: vendorId,
        type: 'credit',
        amount: amount,
        description: 'Earnings from chat/call (per minute)',
        session_id: sessionId,
        request_id: requestId,
      }]);
    }

    return res.status(200).json({
      success: true,
      newBalance: currentBalance - amount,
    });
  } catch (err) {
    console.error('POST /api/wallet/deduct-and-credit error:', err.message);
    return res.status(500).json({ success: false, message: 'Transaction failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR WALLET: Get vendor wallet balance + transactions
// ─────────────────────────────────────────────────────────────────────────────
app.get('/vendor/wallet', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const vendorId = decoded.astroId || decoded.vendorId || decoded.id;

    const { data: astroRow, error } = await supabase
      .from('astrologers')
      .select('wallet_balance')
      .eq('id', vendorId)
      .single();

    if (error) throw error;

    const { data: txns } = await supabase
      .from('vendor_wallet_transactions')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(20);

    return res.status(200).json({
      success: true,
      data: {
        balance: astroRow?.wallet_balance ?? 0,
        transactions: (txns || []).map(t => ({
          id: t.id,
          description: t.description || 'Consultation Earning',
          amount: t.type === 'credit' ? t.amount : -t.amount,
          date: new Date(t.created_at).toLocaleDateString('en-IN'),
        })),
      },
    });
  } catch (err) {
    console.error('GET /vendor/wallet error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch vendor wallet' });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Astrowani backend server is running on http://localhost:${PORT}`);
});

