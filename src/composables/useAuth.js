import { ref } from 'vue'
import { supabase } from '../supabaseClient'

// Module-level state so every component that calls useAuth() shares
// the same reactive session — avoids re-fetching per component.
const user = ref(null)
const session = ref(null)
const authReady = ref(false)

let initialized = false

function initAuthListener() {
  if (initialized) return
  initialized = true

  // Pick up an existing session on page load/refresh
  supabase.auth.getSession().then(({ data }) => {
    session.value = data.session
    user.value = data.session?.user ?? null
    authReady.value = true
  })

  // Keep state in sync with login/logout/token refresh events
  supabase.auth.onAuthStateChange((_event, newSession) => {
    session.value = newSession
    user.value = newSession?.user ?? null
    authReady.value = true
  })
}

export function useAuth() {
  initAuthListener()

  // redirectPath: path (ไม่ใช่ full URL) ที่จะกลับมาหลัง Login สำเร็จ
  // เช่น '/subjects', '/share/abc123' — ถ้าไม่ส่งมา default เป็น '/subjects' เหมือนเดิม
  async function signInWithGoogle(redirectPath = '/subjects') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${redirectPath}`
      }
    })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return {
    user,
    session,
    authReady,
    signInWithGoogle,
    signOut
  }
}