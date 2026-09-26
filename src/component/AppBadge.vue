<script setup>
defineProps({
  variant: {
    type: String,
    default: 'neutral',
    // ai        = "AI สรุปให้" / "AI ออกข้อสอบให้" (สีเหลือง Highlighter)
    // quiz      = ป้ายกำกับการ์ด Quiz (สีฟ้า)
    // flashcard = ป้ายกำกับการ์ด Flashcard Set (สีม่วง)
    // success   = สถานะพร้อมใช้งาน (เขียว)
    // warning   = สถานะกำลังประมวลผล (เหลืองส้ม)
    // danger    = สถานะผิดพลาด (แดง)
    // neutral   = ทั่วไป ไม่มีความหมายพิเศษ (เทา)
    validator: (v) =>
      ['ai', 'quiz', 'flashcard', 'success', 'warning', 'danger', 'neutral'].includes(v)
  }
})
</script>

<template>
  <span class="app-badge" :class="`variant-${variant}`"><slot /></span>
</template>

<style scoped>
.app-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 20px;
  border: 1px solid transparent;
  line-height: 1.4;
}

.variant-ai {
  color: #8a6d1a;
  background: var(--highlighter-soft);
  border-color: var(--highlighter);
}

.variant-quiz {
  color: #1e5a9c;
  background: #e8f1fb;
  border-color: #b9d7f2;
}

.variant-flashcard {
  color: #7a3e9d;
  background: #f3e8fb;
  border-color: #ddb9f2;
}

.variant-success {
  color: var(--success);
  background: var(--success-bg);
  border-color: var(--success-bg);
}

.variant-warning {
  color: #8a5a00;
  background: #fdf0d5;
  border-color: #fdf0d5;
}

.variant-danger {
  color: var(--danger);
  background: var(--danger-bg);
  border-color: var(--danger-bg);
}

.variant-neutral {
  color: var(--ink-soft);
  background: var(--paper);
  border-color: var(--border-strong);
}
</style>
