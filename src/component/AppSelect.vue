<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'

// ตัวเลือกแบบ Dropdown ที่ตกแต่งเองได้ (แทน <select> ของเบราว์เซอร์ ซึ่งเปลี่ยนสีตัวเลือกไม่ได้)
// ใช้: <AppSelect v-model="id" :options="[{ value, label, action? }]" />
//   action: true = ตัวเลือกพิเศษ เช่น "+ สร้างวิชาใหม่" (แสดงแยกด้วยเส้นคั่น + สีเน้น)
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  id: { type: String, default: undefined },
  placeholder: { type: String, default: 'เลือก...' },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const root = ref(null)
const listEl = ref(null)
const isOpen = ref(false)
const openUp = ref(false)
const activeIndex = ref(-1)
const listId = `select-list-${Math.random().toString(36).slice(2, 8)}`

const selected = computed(() => props.options.find((o) => o.value === props.modelValue) || null)

async function open() {
  if (props.disabled || isOpen.value) return
  // เปิดขึ้นด้านบนถ้าด้านล่างไม่พอ
  const rect = root.value.getBoundingClientRect()
  const need = Math.min(props.options.length * 44 + 16, 280)
  openUp.value = window.innerHeight - rect.bottom < need && rect.top > need
  isOpen.value = true
  activeIndex.value = Math.max(0, props.options.findIndex((o) => o.value === props.modelValue))
  await nextTick()
  scrollActiveIntoView()
}

function close() {
  isOpen.value = false
}

function choose(option) {
  emit('update:modelValue', option.value)
  close()
  root.value?.querySelector('button.trigger')?.focus()
}

function scrollActiveIntoView() {
  listEl.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(e) {
  if (props.disabled) return
  const last = props.options.length - 1
  if (!isOpen.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      open()
    }
    return
  }
  if (e.key === 'Escape') { e.preventDefault(); close(); return }
  if (e.key === 'Tab') { close(); return }
  if (e.key === 'ArrowDown') activeIndex.value = Math.min(last, activeIndex.value + 1)
  else if (e.key === 'ArrowUp') activeIndex.value = Math.max(0, activeIndex.value - 1)
  else if (e.key === 'Home') activeIndex.value = 0
  else if (e.key === 'End') activeIndex.value = last
  else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    const option = props.options[activeIndex.value]
    if (option) choose(option)
    return
  } else return
  e.preventDefault()
  nextTick(scrollActiveIntoView)
}

function onDocumentPointerDown(e) {
  if (isOpen.value && root.value && !root.value.contains(e.target)) close()
}

watch(isOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onDocumentPointerDown)
  else document.removeEventListener('pointerdown', onDocumentPointerDown)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="select" :class="{ 'is-open': isOpen, 'is-disabled': disabled }">
    <button
      :id="id"
      type="button"
      class="trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :aria-controls="listId"
      :disabled="disabled"
      @click="isOpen ? close() : open()"
      @keydown="onKeydown"
    >
      <span class="trigger-label" :class="{ 'is-placeholder': !selected }">
        {{ selected ? selected.label : placeholder }}
      </span>
      <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <Transition name="pop">
      <ul v-if="isOpen" :id="listId" ref="listEl" class="list" :class="{ 'is-up': openUp }" role="listbox">
        <li
          v-for="(option, i) in options"
          :key="option.value"
          class="option"
          :class="{
            'is-selected': option.value === modelValue,
            'is-active': i === activeIndex,
            'is-action': option.action,
            'has-divider': option.action && i > 0
          }"
          role="option"
          :aria-selected="option.value === modelValue"
          :data-active="i === activeIndex"
          @pointerenter="activeIndex = i"
          @click="choose(option)"
        >
          <span v-if="option.action" class="option-plus" aria-hidden="true">+</span>
          <span class="option-label">{{ option.label }}</span>
          <svg v-if="option.value === modelValue" class="check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.select { position: relative; width: 100%; }

.trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 0.95rem;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.trigger:hover:not(:disabled) { background: var(--hover); }
.select.is-open .trigger,
.trigger:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent);
}
.trigger:disabled { opacity: 0.55; cursor: not-allowed; }

.trigger-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trigger-label.is-placeholder { color: var(--text-muted); }
.chevron { flex: none; color: var(--text-muted); transition: transform 0.18s; }
.select.is-open .chevron { transform: rotate(180deg); color: var(--primary); }

.list {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 30;
  max-height: 280px;
  margin: 0;
  padding: 0.35rem;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-lift);
}
.list.is-up { top: auto; bottom: calc(100% + 6px); }

.option {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  border-radius: 9px;
  color: var(--text);
  font-size: 0.92rem;
  cursor: pointer;
}
.option-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.option.is-active { background: var(--hover); }
.option.is-selected { color: var(--primary); font-weight: 600; }
.check { flex: none; color: var(--primary); }

.option.has-divider { margin-top: 0.35rem; position: relative; }
.option.has-divider::before {
  content: '';
  position: absolute;
  top: -0.2rem;
  left: 0.4rem;
  right: 0.4rem;
  height: 1px;
  background: var(--border);
}
.option.is-action { color: var(--primary); font-weight: 600; }
.option-plus {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: var(--hover);
  line-height: 1;
}

.pop-enter-active, .pop-leave-active { transition: opacity 0.14s ease, transform 0.14s ease; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-4px); }
.list.is-up.pop-enter-from, .list.is-up.pop-leave-to { transform: translateY(4px); }

@media (prefers-reduced-motion: reduce) {
  .pop-enter-active, .pop-leave-active, .chevron { transition: none; }
}
</style>
