const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MOCK_ASTROLOGERS = [
  { first_name: 'Aacharya', last_name: 'Sharma', experience: 10, languages: ['English', 'Hindi'], email: 'aacharya@test.com', phone_number: '9999999901' },
  { first_name: 'Guruji', last_name: 'Verma', experience: 8, languages: ['Hindi'], email: 'guruji@test.com', phone_number: '9999999902' },
  { first_name: 'Pandit', last_name: 'Shastri', experience: 5, languages: ['English'], email: 'pandit@test.com', phone_number: '9999999903' },
  { first_name: 'Swami', last_name: 'Raj', experience: 15, languages: ['Hindi', 'Sanskrit'], email: 'swami@test.com', phone_number: '9999999904' },
  { first_name: 'Yogi', last_name: 'Patel', experience: 6, languages: ['English', 'Gujarati'], email: 'yogi@test.com', phone_number: '9999999905' },
  { first_name: 'Astrologer', last_name: 'Gupta', experience: 12, languages: ['Hindi'], email: 'gupta@test.com', phone_number: '9999999906' },
  { first_name: 'Rishi', last_name: 'Kumar', experience: 9, languages: ['English', 'Tamil'], email: 'rishi@test.com', phone_number: '9999999907' },
  { first_name: 'Devi', last_name: 'Singh', experience: 11, languages: ['Hindi', 'Punjabi'], email: 'devi@test.com', phone_number: '9999999908' },
];

async function seed() {
  for (const astro of MOCK_ASTROLOGERS) {
    const { data, error } = await supabase.from('astrologers').insert([astro]);
    if (error) {
      console.error('Error inserting', astro.first_name, error.message);
    } else {
      console.log('Inserted', astro.first_name);
    }
  }
  console.log('Done seeding!');
}

seed();
