<script setup>
defineProps({
  variant: {
    type: String,
    default: 'primary', // 'primary' | 'secondary' | 'danger'
    validator: (v) => ['primary', 'secondary', 'danger'].includes(v)
  },
  size: {
    type: String,
    default: 'md', // 'md' | 'sm'
    validator: (v) => ['md', 'sm'].includes(v)
  },
  block: { type: Boolean, default: false }, // width: 100%
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})

defineOptions({ inheritAttrs: false })
</script>

<template>
  <!--
    ใช้เหมือนปุ่มธรรมดา: <AppButton variant="danger" @click="fn" :disabled="x">ลบ</AppButton>
    v-bind="$attrs" ส่งต่อ @click และ attribute อื่นๆ ที่ประกาศตอนใช้งานเข้า <button> จริง
    เพราะ inheritAttrs: false ทำให้ Vue ไม่ auto-apply attrs ไปที่ root element เอง
  -->
  <button
    class="app-btn"
    :class="[`variant-${variant}`, `size-${size}`, { 'is-block': block }]"
    :disabled="disabled || loading"
    v-bind="$attrs"
  >
    <slot v-if="!loading" />
    <slot v-else name="loading">
      <slot />
    </slot>
  </button>
</template>

<style scoped>
.app-btn {
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  border: 1px solid transparent;
  transition: background 0.12s ease, border-color 0.12s ease, opacity 0.12s ease;
}

.app-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.is-block {
  width: 100%;
}

/* ขนาด */
.size-md {
  padding: 0.65rem 1rem;
  font-size: 0.9rem;
}

.size-sm {
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
}

/* Variant: Primary — เดิมคือ generate-btn / submit-btn / save-btn / create-btn */
.variant-primary {
  background: var(--indigo);
  color: #ffffff;
}

.variant-primary:hover:not(:disabled) {
  background: var(--indigo-dark);
}

/* Variant: Secondary — เดิมคือ cancel-btn / edit-btn / review-link */
.variant-secondary {
  background: var(--card);
  color: var(--ink);
  border-color: var(--border-strong);
}

.variant-secondary:hover:not(:disabled) {
  border-color: var(--ink-faint);
}

/* Variant: Danger — เดิมคือ delete-btn */
.variant-danger {
  background: var(--danger-bg);
  color: var(--danger);
  border-color: var(--danger-bg);
}

.variant-danger:hover:not(:disabled) {
  border-color: var(--danger);
}
</style>
