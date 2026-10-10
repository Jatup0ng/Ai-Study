<script setup>
defineProps({
  // true = การ์ดที่คลิกได้ (เช่น ครอบ RouterLink) โชว์ Hover Effect
  // false = การ์ดข้อมูลนิ่งๆ ไม่ต้องการ Hover (เช่น กรอบคำถาม Quiz)
  hoverable: { type: Boolean, default: true },
  // true = ไม่มี Padding ในตัว ให้เนื้อหาข้างในคุม Padding เอง
  // (ใช้ตอนเนื้อหาข้างในมีปุ่ม Action แยกโซนที่ต้องการ Padding ไม่เท่ากัน)
  noPadding: { type: Boolean, default: false }
})
</script>

<template>
  <div class="app-card" :class="{ 'is-hoverable': hoverable, 'no-padding': noPadding }">
    <slot />
  </div>
</template>

<style scoped>
.app-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  padding: 0.9rem 1rem;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.app-card.no-padding {
  padding: 0;
}

.app-card.is-hoverable:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-card);
}
</style>
