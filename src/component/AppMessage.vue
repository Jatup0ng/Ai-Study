<script setup>
defineProps({
  type: {
    type: String,
    default: 'status', // 'status' | 'error'
    validator: (v) => ['status', 'error'].includes(v)
  }
})
</script>

<template>
  <p class="app-message" :class="`type-${type}`"><slot /></p>
</template>

<style scoped>
.app-message {
  font-size: 0.85rem;
  margin: 0 0 1rem;
}

.type-status {
  color: var(--ink-soft);
  margin-bottom: 0; /* ข้อความสถานะปกติมักไม่ต้องเว้นระยะล่างเท่า Error */
}

.type-error {
  color: var(--danger);
}
</style>
