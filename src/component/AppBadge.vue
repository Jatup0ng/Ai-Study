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
  color: var(--warning);
  background: var(--warning-bg);
  border-color: var(--warning);
}

.variant-quiz {
  color: var(--info);
  background: var(--info-bg);
  border-color: color-mix(in srgb, var(--info) 35%, var(--border));
}

.variant-flashcard {
  color: color-mix(in srgb, var(--secondary) 70%, var(--text));
  background: color-mix(in srgb, var(--secondary) 14%, transparent);
  border-color: color-mix(in srgb, var(--secondary) 35%, var(--border));
}

.variant-success {
  color: var(--success);
  background: var(--success-bg);
  border-color: var(--success-bg);
}

.variant-warning {
  color: var(--warning);
  background: var(--warning-bg);
  border-color: var(--warning-bg);
}

.variant-danger {
  color: var(--danger);
  background: var(--danger-bg);
  border-color: var(--danger-bg);
}

.variant-neutral {
  color: var(--text-muted);
  background: var(--bg);
  border-color: var(--border-strong);
}
</style>
