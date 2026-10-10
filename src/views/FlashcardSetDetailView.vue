<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabaseClient'
import ShareButton from '../component/ShareButton.vue'
import MarkdownContent from '../component/MarkdownContent.vue'

const props = defineProps({
  flashcardSetId: { type: String, required: true }
})

const router = useRouter()

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

// --- โหมดทบทวนทีละใบ (สถานะอยู่ฝั่ง Client เฉพาะรอบนี้ ไม่บันทึกลง DB) ---
const viewMode = ref('card') // 'card' | 'grid'
const order = ref([]) // ลำดับของ index ใน cards
const pos = ref(0) // ตำแหน่งปัจจุบันใน order (= order.length แปลว่าจบรอบ)
const knownIds = ref(new Set())
const unknownIds = ref(new Set())

const isFinished = computed(() => order.value.length > 0 && pos.value >= order.value.length)
const currentCard = computed(() => (isFinished.value ? null : cards.value[order.value[pos.value]] || null))

function resetSession() {
  order.value = cards.value.map((_, i) => i)
  pos.value = 0
  knownIds.value = new Set()
  unknownIds.value = new Set()
  flippedIds.value = new Set()
}

function shuffleSession() {
  resetSession()
  const arr = [...order.value]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  order.value = arr
}

function reviewUnknown() {
  const ids = unknownIds.value
  order.value = order.value.filter((i) => ids.has(cards.value[i].flashcard_id))
  pos.value = 0
  unknownIds.value = new Set()
  flippedIds.value = new Set()
}

function goPrev() {
  if (isFinished.value) pos.value = order.value.length - 1
  else if (pos.value > 0) pos.value--
}

function goNext() {
  if (pos.value < order.value.length) pos.value++
}

function mark(kind) {
  const card = currentCard.value
  if (!card) return
  const known = new Set(knownIds.value)
  const unknown = new Set(unknownIds.value)
  known.delete(card.flashcard_id)
  unknown.delete(card.flashcard_id)
  ;(kind === 'known' ? known : unknown).add(card.flashcard_id)
  knownIds.value = known
  unknownIds.value = unknown
  goNext()
}

const backTarget = computed(() =>
  flashcardSet.value?.subject_id
    ? { name: 'subject-workspace', params: { id: flashcardSet.value.subject_id } }
    : { name: 'subjects' }
)

function closeModal() {
  router.push(backTarget.value)
}

// --- คีย์ลัด: Esc ปิด, ลูกศรเปลี่ยนใบ, Space พลิกการ์ด ---
const closeBtn = ref(null)

function onKeydown(e) {
  if (e.key === 'Escape') {
    closeModal()
    return
  }
  if (viewMode.value !== 'card' || isFinished.value) return
  if (e.key === 'ArrowLeft') goPrev()
  else if (e.key === 'ArrowRight') goNext()
  else if ((e.key === ' ' || e.key === 'Enter') && currentCard.value) {
    // ปล่อยให้ปุ่ม/ช่องกรอกที่โฟกัสอยู่ทำงานของมันเอง
    if (e.target?.closest?.('button, input, textarea, a')) return
    e.preventDefault()
    toggleFlip(currentCard.value.flashcard_id)
  }
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
  resetSession()
  isLoading.value = false
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
  await fetchFlashcardSet()
  await nextTick()
  closeBtn.value?.focus()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="overlay" @click.self="closeModal">
    <div class="modal" role="dialog" aria-modal="true" :aria-label="flashcardSet?.title || 'บัตรคำ'">
      <header class="modal-head">
        <div class="head-main">
          <h1>{{ flashcardSet?.title || 'บัตรคำ' }}</h1>
          <span v-if="flashcardSet" class="chip">{{ cards.length }} ใบ</span>
        </div>
        <div class="head-actions">
          <ShareButton
            v-if="flashcardSet"
            content-type="flashcard_set"
            :content-id="flashcardSetId"
          />
          <button
            v-if="flashcardSet && cards.length"
            type="button"
            class="mode-btn"
            @click="viewMode = viewMode === 'card' ? 'grid' : 'card'"
          >
            {{ viewMode === 'card' ? 'ดูทั้งหมด' : 'ทบทวนทีละใบ' }}
          </button>
          <button ref="closeBtn" type="button" class="close-btn" aria-label="ปิด" @click="closeModal">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </header>

      <p v-if="errorMessage" class="error-text" role="alert">{{ errorMessage }}</p>
      <p v-if="isLoading" class="status-text">กำลังโหลด...</p>

      <template v-else-if="flashcardSet">
        <p v-if="cards.length === 0" class="status-text">Flashcard ชุดนี้ยังไม่มีใบเลย</p>

        <!-- ทบทวนทีละใบ -->
        <div v-else-if="viewMode === 'card'" class="stage">
          <template v-if="!isFinished && currentCard">
            <button
              type="button"
              class="big-card"
              :class="{ 'is-flipped': isFlipped(currentCard.flashcard_id) }"
              :aria-label="isFlipped(currentCard.flashcard_id) ? 'พลิกกลับไปดูคำถาม' : 'พลิกดูคำตอบ'"
              @click="toggleFlip(currentCard.flashcard_id)"
            >
              <span class="card-top">
                <span>{{ pos + 1 }} / {{ order.length }} รายการ</span>
                <span class="face-label">{{ isFlipped(currentCard.flashcard_id) ? 'คำตอบ' : 'คำถาม' }}</span>
              </span>
              <span class="card-text">
                <MarkdownContent
                  inline
                  :source="isFlipped(currentCard.flashcard_id) ? currentCard.answer : currentCard.question"
                />
              </span>
              <span class="card-hint">
                {{ isFlipped(currentCard.flashcard_id) ? 'คลิกเพื่อดูคำถาม' : 'ดูคำตอบ' }}
              </span>
            </button>

            <div class="controls">
              <button type="button" class="round-btn" aria-label="ใบก่อนหน้า" :disabled="pos === 0" @click="goPrev">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
              </button>
              <button type="button" class="pill-btn pill-unknown" @click="mark('unknown')">
                ✕ ยังไม่จำ <b>{{ unknownIds.size }}</b>
              </button>
              <button type="button" class="pill-btn pill-known" @click="mark('known')">
                <b>{{ knownIds.size }}</b> จำได้ ✓
              </button>
              <button type="button" class="round-btn" aria-label="ใบถัดไป" @click="goNext">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          </template>

          <div v-else class="finish-card">
            <div class="finish-title">จบรอบนี้แล้ว</div>
            <div class="finish-score">
              <span class="ok">จำได้ {{ knownIds.size }}</span>
              <span class="no">ยังไม่จำ {{ unknownIds.size }}</span>
            </div>
            <div class="finish-actions">
              <button
                v-if="unknownIds.size > 0"
                type="button"
                class="primary-btn"
                @click="reviewUnknown"
              >
                ทบทวนเฉพาะที่ยังไม่จำ
              </button>
              <button type="button" class="ghost-btn" @click="resetSession">เริ่มใหม่ทั้งชุด</button>
            </div>
          </div>
        </div>

        <!-- ดูทั้งหมด (มุมมองกริดเดิม) -->
        <div v-else class="grid-wrap">
          <div class="bulk-actions">
            <button class="mode-btn" @click="flipAll(true)">พลิกดูคำตอบทั้งหมด</button>
            <button class="mode-btn" @click="flipAll(false)">พลิกกลับทั้งหมด</button>
          </div>
          <div class="card-grid">
            <button
              v-for="c in cards"
              :key="c.flashcard_id"
              type="button"
              class="mini-card"
              :class="{ 'is-flipped': isFlipped(c.flashcard_id) }"
              @click="toggleFlip(c.flashcard_id)"
            >
              <span class="face-label">{{ isFlipped(c.flashcard_id) ? 'คำตอบ' : 'คำถาม' }}</span>
              <span class="mini-text">
                <MarkdownContent inline :source="isFlipped(c.flashcard_id) ? c.answer : c.question" />
              </span>
            </button>
          </div>
        </div>
      </template>

      <footer v-if="flashcardSet && cards.length" class="modal-foot">
        <span class="foot-hint">Space พลิกการ์ด · ลูกศรเปลี่ยนใบ · Esc ปิด</span>
        <div class="foot-actions">
          <button type="button" class="mode-btn" @click="shuffleSession">สลับลำดับ</button>
          <button type="button" class="mode-btn" @click="resetSession">เริ่มใหม่</button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(21, 25, 39, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.modal {
  width: 100%;
  max-width: 1100px;
  height: min(780px, 100%);
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 30px 80px -30px rgba(0, 0, 0, 0.55);
}

:root[data-theme='dark'] .modal {
  background: var(--surface);
}

.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.4rem 1.75rem;
}

.head-main {
  min-width: 0;
}

.head-main h1 {
  font-size: 1.4rem;
  margin: 0 0 0.6rem;
}

.chip {
  display: inline-block;
  padding: 0.15rem 0.8rem;
  border-radius: 99px;
  border: 1px solid var(--border);
  font-size: 0.78rem;
  color: var(--text-muted);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

.close-btn {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 12px;
  background: none;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.close-btn:hover {
  background: var(--hover);
}

.mode-btn {
  padding: 0.45rem 0.95rem;
  border-radius: 99px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 0.82rem;
  cursor: pointer;
}

.mode-btn:hover {
  background: var(--hover);
}

.status-text {
  padding: 0 1.75rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.error-text {
  margin: 0 1.75rem;
  color: var(--danger);
  background: var(--danger-bg);
  border-radius: 10px;
  padding: 0.6rem 0.9rem;
  font-size: 0.85rem;
}

/* --- เวทีการ์ด --- */
.stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.6rem;
  padding: 1rem 1.5rem;
  background:
    radial-gradient(circle at 28% 55%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 42%),
    radial-gradient(circle at 72% 55%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 42%);
}

.big-card {
  width: min(580px, 100%);
  min-height: 300px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem 2rem;
  border-radius: 28px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  box-shadow: 0 18px 40px -22px rgba(20, 30, 70, 0.45);
}

:root[data-theme='dark'] .big-card {
  background: var(--hover);
}

.card-top {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.face-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--primary);
}

.card-text {
  font-family: var(--font-serif);
  font-size: 1.55rem;
  line-height: 1.55;
  word-break: break-word;
}

.card-hint {
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.controls {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.round-btn {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--hover);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.round-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pill-btn {
  height: 52px;
  padding: 0 1.5rem;
  border-radius: 26px;
  border: 1px solid var(--border);
  background: var(--hover);
  font-size: 0.98rem;
  cursor: pointer;
}

.pill-unknown {
  color: var(--danger);
}

.pill-known {
  color: var(--success);
}

.finish-card {
  width: min(460px, 100%);
  padding: 2rem;
  border-radius: 24px;
  border: 1px solid var(--border);
  background: var(--surface);
  text-align: center;
}

:root[data-theme='dark'] .finish-card {
  background: var(--hover);
}

.finish-title {
  font-family: var(--font-heading);
  font-size: 1.4rem;
  font-weight: 700;
  margin-bottom: 0.9rem;
}

.finish-score {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.4rem;
}

.finish-score .ok {
  color: var(--success);
}

.finish-score .no {
  color: var(--danger);
}

.finish-actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.primary-btn,
.ghost-btn {
  padding: 0.65rem 1.2rem;
  border-radius: 10px;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
}

.primary-btn {
  border: none;
  background: var(--primary);
  color: var(--on-primary);
}

.ghost-btn {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}

/* --- มุมมองกริด --- */
.grid-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.5rem 1.75rem 1.25rem;
}

.bulk-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0.9rem;
}

.mini-card {
  min-height: 140px;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem 1.1rem;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.mini-card.is-flipped {
  border-color: var(--primary);
  background: var(--hover);
}

.mini-text {
  font-size: 0.95rem;
  line-height: 1.6;
  word-break: break-word;
}

/* --- ท้ายหน้าต่าง --- */
.modal-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1.75rem;
  border-top: 1px solid var(--border);
}

.foot-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.foot-actions {
  display: flex;
  gap: 0.5rem;
}

@media (max-width: 700px) {
  .overlay {
    padding: 0;
  }
  .modal {
    height: 100%;
    border-radius: 0;
  }
  .foot-hint {
    display: none;
  }
}
</style>
