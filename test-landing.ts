import { supabase } from './src/lib/supabase'

async function test() {
  const { data, error } = await supabase.from('app_settings').select('*').eq('key', 'landing_page_cms')
  console.log('Landing page settings in DB:')
  console.log(JSON.stringify(data, null, 2))
  if (error) console.error('Error:', error)
}
test()
