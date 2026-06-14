import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
