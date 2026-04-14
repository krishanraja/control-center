import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || 'https://gojpffsrxybbpbdzzrvs.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvanBmZnNyeHliYnBiZHp6cnZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE3NzA2MywiZXhwIjoyMDkxNzUzMDYzfQ.QU6yz1uhH01U-Dcomd4DoPsGZmxYHh29K4bCOmfAKZc'

export const supabase = createClient(url, key)
