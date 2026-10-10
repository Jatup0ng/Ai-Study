import { ref } from 'vue'

const STORAGE_KEY = 'ai-study-theme'

// 'light' | 'dark' — state ระดับ module ให้ทุก component ใช้ร่วมกัน
const theme = ref('light')

function apply(value) {
  theme.value = value
  document.documentElement.dataset.theme = value
}

function readSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // localStorage ใช้ไม่ได้ (เช่น private mode) — ใช้ค่าตามระบบแทน
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// เรียกครั้งเดียวใน main.js ก่อน mount เพื่อไม่ให้หน้าวาบสีผิดตอนโหลด
export function initTheme() {
  apply(readSaved())
}

export function useTheme() {
  function setTheme(value) {
    apply(value)
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // ไม่เป็นไร — แค่ไม่จำค่าข้าม session
    }
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme, toggleTheme }
}
