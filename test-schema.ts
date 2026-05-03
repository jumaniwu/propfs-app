import { supabase } from './src/lib/supabase'

async function test() {
  const { data, error } = await supabase.from('invoices').select('*').limit(1)
  console.log('Error:', error)
}
test()
