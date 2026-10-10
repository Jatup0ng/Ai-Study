<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { activeDialog, closeActiveDialog, toasts, dismissToast } from '../composables/useDialog'

const dialogEl = ref(null)
const confirmBtn = ref(null)
const cancelBtn = ref(null)
let lastFocused = null

// เปิดกล่อง: จำ element ที่โฟกัสอยู่ + ย้ายโฟกัสเข้ากล่อง
// กล่องอันตราย (ลบ) โฟกัสที่ "ยกเลิก" ก่อน กันกด Enter ลบพลาด
watch(activeDialog, async (dialog, previous) => {
  if (dialog && !previous) lastFocused = document.activeElement
  if (dialog) {
    await nextTick()
    const target = dialog.tone === 'danger' && cancelBtn.value ? cancelBtn.value : confirmBtn.value
    target?.focus()
  } else if (previous) {
    lastFocused?.focus?.()
    lastFocused = null
  }
})

function finish(result) {
  closeActiveDialog(result)
}

function onKeydown(e) {
  const dialog = activeDialog.value
  if (!dialog) return
  if (e.key === 'Escape') {
    e.preventDefault()
    finish(dialog.kind === 'alert')
    return
  }
  // Tab วนอยู่ในกล่อง
  if (e.key === 'Tab' && dialogEl.value) {
    const focusable = dialogEl.value.querySelectorAll('button:not([disabled])')
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

watch(
  () => !!activeDialog.value,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  }
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const TOAST_TITLE = { success: 'สำเร็จ', info: 'แจ้งให้ทราบ', warning: 'โปรดตรวจสอบ', error: 'เกิดข้อผิดพลาด' }

// toast: หยุดนับเวลาตอนเมาส์อยู่บนการ์ด
const timers = new Map()
function startTimer(t) {
  if (!t.duration || timers.has(t.id)) return
  timers.set(t.id, setTimeout(() => { timers.delete(t.id); dismissToast(t.id) }, t.duration))
}
function pauseTimer(t) {
  clearTimeout(timers.get(t.id))
  timers.delete(t.id)
}
function closeToast(t) {
  pauseTimer(t)
  dismissToast(t.id)
}
watch(
  toasts,
  (list) => list.forEach(startTimer),
  { deep: true, immediate: true }
)
onBeforeUnmount(() => timers.forEach((id) => clearTimeout(id)))
</script>

<template>
  <Teleport to="body">
    <!-- กล่องยืนยัน / แจ้งเตือนสำคัญ -->
    <Transition name="dlg">
      <div v-if="activeDialog" class="dlg-backdrop" @mousedown.self="finish(activeDialog.kind === 'alert')">
        <div
          ref="dialogEl"
          class="dlg"
          :class="`tone-${activeDialog.tone}`"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="dlg-title"
          :aria-describedby="activeDialog.message ? 'dlg-message' : undefined"
        >
          <div class="dlg-head">
            <span class="dlg-icon" aria-hidden="true">
              <svg v-if="activeDialog.tone === 'danger'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
              </svg>
              <svg v-else-if="activeDialog.tone === 'warning'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.1" />
              </svg>
              <svg v-else-if="activeDialog.tone === 'success'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" />
              </svg>
              <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.8v.1" />
              </svg>
            </span>
            <div class="dlg-text">
              <h2 id="dlg-title" class="dlg-title">{{ activeDialog.title }}</h2>
              <p v-if="activeDialog.message" id="dlg-message" class="dlg-message">{{ activeDialog.message }}</p>
            </div>
          </div>

          <ul v-if="activeDialog.items.length" class="dlg-items">
            <li v-for="item in activeDialog.items" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </li>
          </ul>

          <ul v-if="activeDialog.warnings.length" class="dlg-warnings">
            <li v-for="(w, i) in activeDialog.warnings" :key="i">{{ w }}</li>
          </ul>

          <div class="dlg-actions">
            <button
              v-if="activeDialog.kind === 'confirm'"
              ref="cancelBtn"
              type="button"
              class="dlg-btn ghost"
              @click="finish(false)"
            >
              {{ activeDialog.cancelText }}
            </button>
            <button ref="confirmBtn" type="button" class="dlg-btn solid" @click="finish(true)">
              {{ activeDialog.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Toast มุมขวาบน -->
    <div class="toast-stack" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="toast"
          :class="`type-${t.type}`"
          :role="t.type === 'error' ? 'alert' : 'status'"
          @mouseenter="pauseTimer(t)"
          @mouseleave="startTimer(t)"
        >
          <span class="toast-icon" aria-hidden="true">
            <svg v-if="t.type === 'success'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            <svg v-else-if="t.type === 'error'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 6v7M12 17.5v.1" /></svg>
            <svg v-else-if="t.type === 'warning'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 6v7M12 17.5v.1" /></svg>
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 11v6M12 7.5v.1" /></svg>
          </span>
          <div class="toast-body">
            <p class="toast-title">{{ t.title || TOAST_TITLE[t.type] }}</p>
            <p class="toast-message">{{ t.message }}</p>
          </div>
          <button type="button" class="toast-close" aria-label="ปิดการแจ้งเตือน" @click="closeToast(t)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
/* ---------- กล่องกลางจอ ---------- */
.dlg-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 1.25rem;
  background: var(--scrim);
  backdrop-filter: blur(3px);
}

.dlg {
  --tone: var(--info);
  --tone-bg: var(--info-bg);
  width: min(100%, 440px);
  max-height: calc(100vh - 2.5rem);
  overflow-y: auto;
  padding: 1.5rem;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lift);
}
.dlg.tone-danger { --tone: var(--danger); --tone-bg: var(--danger-bg); }
.dlg.tone-warning { --tone: var(--warning); --tone-bg: var(--warning-bg); }
.dlg.tone-success { --tone: var(--success); --tone-bg: var(--success-bg); }

.dlg-head { display: flex; gap: 0.9rem; align-items: flex-start; }

.dlg-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: var(--tone-bg);
  color: var(--tone);
}

.dlg-text { min-width: 0; padding-top: 0.1rem; }
.dlg-title { margin: 0; font-size: 1.15rem; line-height: 1.35; overflow-wrap: anywhere; }
.dlg-message { margin: 0.4rem 0 0; font-size: 0.92rem; line-height: 1.65; color: var(--text-muted); overflow-wrap: anywhere; }

.dlg-items {
  list-style: none;
  margin: 1.1rem 0 0;
  padding: 0.35rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
}
.dlg-items li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.dlg-items li + li { border-top: 1px solid var(--border); }
.dlg-items strong { color: var(--text); font-variant-numeric: tabular-nums; }

.dlg-warnings { list-style: none; margin: 0.9rem 0 0; padding: 0; display: grid; gap: 0.5rem; }
.dlg-warnings li {
  padding: 0.65rem 0.85rem;
  border-left: 3px solid var(--warning);
  border-radius: 8px;
  background: var(--warning-bg);
  color: var(--text);
  font-size: 0.86rem;
  line-height: 1.6;
}

.dlg-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.5rem; }

.dlg-btn {
  min-width: 96px;
  padding: 0.62rem 1.15rem;
  border-radius: 12px;
  border: 1px solid transparent;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}
.dlg-btn:active { transform: translateY(1px); }
.dlg-btn.ghost { background: transparent; border-color: var(--border); color: var(--text); }
.dlg-btn.ghost:hover { background: var(--hover); }
.dlg-btn.solid { background: var(--primary); color: var(--on-primary); }
.dlg-btn.solid:hover { background: var(--primary-strong); }
.dlg.tone-danger .dlg-btn.solid { background: var(--danger); color: var(--on-primary); }
.dlg.tone-danger .dlg-btn.solid:hover { background: color-mix(in srgb, var(--danger) 88%, var(--text)); }

/* ---------- Toast ---------- */
.toast-stack {
  position: fixed;
  top: 1.1rem;
  right: 1.1rem;
  z-index: 110;
  display: grid;
  gap: 0.6rem;
  width: min(calc(100vw - 2rem), 380px);
  pointer-events: none;
}

.toast {
  --tone: var(--info);
  --tone-bg: var(--info-bg);
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.85rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--tone) 30%, var(--border));
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-lift);
}
.toast.type-success { --tone: var(--success); --tone-bg: var(--success-bg); }
.toast.type-warning { --tone: var(--warning); --tone-bg: var(--warning-bg); }
.toast.type-error { --tone: var(--danger); --tone-bg: var(--danger-bg); }

.toast-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: var(--tone-bg);
  color: var(--tone);
}
.toast-body { flex: 1; min-width: 0; }
.toast-title { margin: 0; font-size: 0.88rem; font-weight: 700; color: var(--text); }
.toast-message { margin: 0.15rem 0 0; font-size: 0.85rem; line-height: 1.55; color: var(--text-muted); overflow-wrap: anywhere; }
.toast-close {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.toast-close:hover { background: var(--hover); color: var(--text); }

/* ---------- Animation ---------- */
.dlg-enter-active, .dlg-leave-active { transition: opacity 0.18s ease; }
.dlg-enter-active .dlg, .dlg-leave-active .dlg { transition: transform 0.2s ease, opacity 0.18s ease; }
.dlg-enter-from, .dlg-leave-to { opacity: 0; }
.dlg-enter-from .dlg, .dlg-leave-to .dlg { transform: translateY(10px) scale(0.97); opacity: 0; }

.toast-enter-active, .toast-leave-active { transition: transform 0.22s ease, opacity 0.2s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(24px); }
.toast-move { transition: transform 0.2s ease; }

@media (max-width: 640px) {
  .toast-stack { top: auto; bottom: 1rem; right: 50%; transform: translateX(50%); }
  .dlg-actions { flex-direction: column-reverse; }
  .dlg-btn { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .dlg-enter-active, .dlg-leave-active, .dlg-enter-active .dlg, .dlg-leave-active .dlg,
  .toast-enter-active, .toast-leave-active, .toast-move { transition: none; }
}
</style>
