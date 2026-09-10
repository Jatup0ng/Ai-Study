import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'ไม่พบ VITE_SUPABASE_URL หรือ VITE_SUPABASE_ANON_KEY\n' +
    '→ เช็คว่ามีไฟล์ .env อยู่ที่ Root ของโปรเจค (ระดับเดียวกับ package.json)\n' +
    '→ ถ้าเพิ่งสร้าง/แก้ .env ต้อง Restart `npm run dev` ใหม่เสมอ (Vite อ่านค่าแค่ตอน Start)'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
