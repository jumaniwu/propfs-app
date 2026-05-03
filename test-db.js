import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://ciazztqmkhzrgbaqfyyz.supabase.co', 'sb_publishable_1BxZhA48DtR8KG94xUm0zg_6w-dg1xD')

async function run() {
  const { data, error } = await supabase.from('app_settings').select('*').eq('key', 'landing_page_cms')
  console.log('Result:', JSON.stringify(data, null, 2))
  console.log('Error:', error)
}
run()
