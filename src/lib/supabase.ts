import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gojpffsrxybbpbdzzrvs.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvanBmZnNyeHliYnBiZHp6cnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzcwNjMsImV4cCI6MjA5MTc1MzA2M30.cDIAwYwSYVh58rL-F1j4vTRqwamaigsrqvv0SbBDpnc'

export const supabase = createClient(supabaseUrl, supabaseKey)
