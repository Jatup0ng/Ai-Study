<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../supabaseClient'

const props = defineProps({
  flashcardSetId: { type: String, required: true }
})

const flashcardSet = ref(null) // { flashcard_set_id, title, subject_id }
const cards = ref([]) // [{ flashcard_id, question, answer }]

const isLoading = ref(true)
const errorMessage = ref('')

// เก็บ id ของใบที่ถูกพลิกไว้ (แสดงคำตอบ) — พลิกกลับได้ คลิกซ้ำ
const flippedIds = ref(new Set())

function isFlipped(cardId) {
  return flippedIds.value.has(cardId)
}

function toggleFlip(cardId) {
  const next = new Set(flippedIds.value)
  if (next.has(cardId)) next.delete(cardId)
  else next.add(cardId)
  flippedIds.value = next
}

function flipAll(show) {
  flippedIds.value = show ? new Set(cards.value.map((c) => c.flashcard_id)) : new Set()
}

async function fetchFlashcardSet() {
  isLoading.value = true
  errorMessage.value = ''

  const { data: setRow, error: setErr } = await supabase
    .from('flashcard_sets')
    .select('flashcard_set_id, title, subject_id')
    .eq('flashcard_set_id', props.flashcardSetId)
    .maybeSingle()

  if (setErr) {
    errorMessage.value = 'โหลด Flashcard ไม่สำเร็จ: ' + setErr.message
    isLoading.value = false
    return
  }
  if (!setRow) {
    errorMessage.value = 'ไม่พบ Flashcard ชุดนี้ หรือคุณไม่มีสิทธิ์เข้าถึง'
    isLoading.value = false
    return
  }
  flashcardSet.value = setRow

  const { data: cardRows, error: cardErr } = await supabase
    .from('flashcards')
    .select('flashcard_id, question, answer')
    .eq('flashcard_set_id', props.flashcardSetId)
    .order('flashcard_id', { ascending: true })

  if (cardErr) {
    errorMessage.value = 'โหลดการ์ดไม่สำเร็จ: ' + cardErr.message
    isLoading.value = false
    return
  }

  cards.value = cardRows || []
  isLoading.value = false
}

onMounted(fetchFlashcardSet)
</script>

<template>
  <div class="page">
    <RouterLink
      v-if="flashcardSet"
      :to="{ name: 'subject-workspace', params: { id: flashcardSet.subject_id } }"
      class="back-link"
    >
      ← กลับไปหน้าวิชา
    </RouterLink>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    <p v-if="isLoading" class="status-text">กำลังโหลด...</p>

    <template v-else-if="flashcardSet">
      <header class="page-header">
        <h1>{{ flashcardSet.title }}</h1>
        <p class="hint-label">คลิกที่การ์ดเพื่อพลิกดูคำตอบ — {{ cards.length }} ใบ</p>
      </header>

      <div class="bulk-actions" v-if="cards.length > 0">
        <button class="bulk-btn" @click="flipAll(true)">พลิกดูคำตอบทั้งหมด</button>
        <button class="bulk-btn" @click="flipAll(false)">พลิกกลับทั้งหมด</button>
      </div>

      <p v-if="cards.length === 0" class="status-text">Flashcard ชุดนี้ยังไม่มีใบเลย</p>

      <div class="card-grid">
        <button
          v-for="c in cards"
          :key="c.flashcard_id"
          type="button"
          class="flip-card"
          :class="{ 'is-flipped': isFlipped(c.flashcard_id) }"
          @click="toggleFlip(c.flashcard_id)"
        >
          <div class="flip-card-inner">
            <div class="flip-card-face flip-card-front">
              <span class="face-label">คำถาม</span>
              <p class="face-text">{{ c.question }}</p>
            </div>
            <div class="flip-card-face flip-card-back">
              <span class="face-label">คำตอบ</span>
              <p class="face-text">{{ c.answer }}</p>
            </div>
          </div>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}

.back-link {
  display: inline-block;
  color: var(--ink-faint);
  font-size: 0.85rem;
  text-decoration: none;
  margin-bottom: 1.25rem;
}

.back-link:hover {
  text-decoration: underline;
}

.page-header {
  margin-bottom: 1.25rem;
}

.page-header h1 {
  font-size: 1.5rem;
  margin: 0 0 0.3rem;
}

.hint-label {
  font-size: 0.85rem;
  color: var(--ink-faint);
  margin: 0;
}

.status-text {
  color: var(--ink-soft);
  font-size: 0.9rem;
}

.error-text {
  color: var(--danger);
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.bulk-actions {
  display: flex;
  gap: 0.6rem;
  margin-bottom: 1.5rem;
}

.bulk-btn {
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--card);
  color: var(--ink);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.bulk-btn:hover {
  border-color: var(--indigo);
  color: var(--indigo);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}

.flip-card {
  perspective: 1000px;
  height: 180px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
}

.flip-card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.5s;
  transform-style: preserve-3d;
}

.flip-card.is-flipped .flip-card-inner {
  transform: rotateY(180deg);
}

.flip-card-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--card);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
}

.flip-card-front {
  background: var(--card);
}

.flip-card-back {
  background: var(--highlighter-soft);
  border-color: var(--highlighter);
  transform: rotateY(180deg);
}

.face-label {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--ink-faint);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.face-text {
  font-size: 0.92rem;
  line-height: 1.55;
  margin: 0;
  color: var(--ink);
}
</style>
