const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://mmsmsuofmxjdxhicnwnl.supabase.co';
// Read key from .env if possible, or I'll just use the public anon key if I know it, wait I don't have it in this script. Let's just grep the anon key from the frontend.
