import { ref } from 'vue'

// ==============================================================
// ระบบ pop up กลางของแอป (แทน window.confirm / window.alert)
//   - confirmDialog({...}) -> Promise<boolean>   กล่องยืนยัน (ตรงกลางจอ)
//   - alertDialog({...})   -> Promise<void>      กล่องแจ้งเรื่องสำคัญ (ตรงกลางจอ)
//   - toast.success/info/warning/error(...)      แจ้งเตือนสั้น ๆ มุมจอ หายเอง
// state อยู่ระดับ module — ใช้ได้จากทุก component โดย <AppDialogHost /> ใน App.vue แสดงผลให้
// ==============================================================

// กล่องที่กำลังแสดง + คิวที่รอ (กันกล่องซ้อนกัน)
export const activeDialog = ref(null)
const queue = []

function showNext() {
  activeDialog.value = queue.shift() || null
}

function openDialog(options) {
  return new Promise((resolve) => {
    queue.push({
      kind: 'confirm',
      tone: 'info', // 'danger' | 'warning' | 'info' | 'success'
      title: '',
      message: '',
      items: [], // [{ label, value }] แถวสรุป เช่น เอกสาร: 1
      warnings: [], // ["ข้อความเตือน", ...]
      confirmText: 'ตกลง',
      cancelText: 'ยกเลิก',
      ...options,
      resolve
    })
    if (!activeDialog.value) showNext()
  })
}

export function confirmDialog(options) {
  return openDialog({ kind: 'confirm', ...options })
}

export function alertDialog(options) {
  return openDialog({ kind: 'alert', tone: 'warning', confirmText: 'รับทราบ', ...options }).then(() => {})
}

// เรียกจากตัว Host เมื่อผู้ใช้กดปุ่ม / Esc / คลิกพื้นหลัง
export function closeActiveDialog(result) {
  const current = activeDialog.value
  if (!current) return
  current.resolve(result)
  showNext()
}

// ---------------- Toast ----------------
export const toasts = ref([])
let nextToastId = 1

const DEFAULT_DURATION = { success: 3500, info: 4500, warning: 6500, error: 8000 }

export function dismissToast(id) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

function pushToast(type, message, options = {}) {
  const toast = {
    id: nextToastId++,
    type,
    title: options.title || '',
    message,
    duration: options.duration ?? DEFAULT_DURATION[type]
  }
  // จำกัดไม่เกิน 4 อันพร้อมกัน — อันเก่าสุดออกก่อน
  toasts.value = [...toasts.value, toast].slice(-4)
  return toast.id
}

export const toast = {
  success: (message, options) => pushToast('success', message, options),
  info: (message, options) => pushToast('info', message, options),
  warning: (message, options) => pushToast('warning', message, options),
  error: (message, options) => pushToast('error', message, options)
}

export function useDialog() {
  return { confirmDialog, alertDialog, toast }
}
