import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.from('app_settings').select('*').eq('key', 'landing_page_cms')
  console.log('Landing page settings in DB:')
  console.log(JSON.stringify(data, null, 2))
  if (error) console.error('Error:', error)
}
test()
