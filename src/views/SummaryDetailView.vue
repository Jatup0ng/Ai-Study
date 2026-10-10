<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../supabaseClient'
import { toast } from '../composables/useDialog'
import ShareButton from '../component/ShareButton.vue'
import MarkdownContent from '../component/MarkdownContent.vue'

const props = defineProps({
  summaryId: { type: String, required: true }
})

const summary = ref(null) // { summary_id, content, created_at, updated_at, subject_id }
const sourceFileNames = ref([]) // ชื่อไฟล์ต้นทางทั้งหมด (รองรับทั้งกรณี 1 หรือหลายไฟล์)

// ถ้าเอกสารต้นทางถูกลบไปหมดแล้ว summary จะ "กำพร้า" — Chat ใช้ไม่ได้
// (แต่เนื้อหาสรุปยังอ่าน/แก้ไขได้ปกติ ไม่กระทบส่วนอื่น)
const chatDisabled = computed(() => !isLoading.value && sourceFileNames.value.length === 0)

const isLoading = ref(true)
const errorMessage = ref('')

const isEditing = ref(false)
const editedContent = ref('')
const isSaving = ref(false)
const saveError = ref('')

// --- Studio Panel: Chat / Quiz / Flashcard ---
const activeTab = ref('chat') // 'chat' | 'quiz' | 'flashcard'

// Chat ไม่เก็บถาวรใน Database (ตามที่ยืนยันไว้) — หายเมื่อ Refresh หน้า
const chatMessages = ref([]) // [{ role: 'user' | 'model', text: string }]
const chatInput = ref('')
const isSending = ref(false)
const chatError = ref('')
const chatScrollEl = ref(null)

function scrollChatToBottom() {
  requestAnimationFrame(() => {
    if (chatScrollEl.value) chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight
  })
}

async function sendChatMessage(text) {
  const message = (text ?? chatInput.value).trim()
  if (!message || isSending.value || chatDisabled.value) return

  // ประวัติที่ส่งให้ Edge Function คือทุกข้อความ "ก่อนหน้า" ข้อความใหม่นี้
  // (ฝั่ง Client เก็บเองทั้งหมด ไม่ได้ Persist ฝั่ง Server)
  const historyToSend = chatMessages.value.map((m) => ({ role: m.role, text: m.text }))

  chatMessages.value.push({ role: 'user', text: message })
  chatInput.value = ''
  chatError.value = ''
  isSending.value = true
  scrollChatToBottom()

  const { data, error } = await supabase.functions.invoke('chat-with-document', {
    body: { summary_id: props.summaryId, message, history: historyToSend }
  })

  if (error) {
    chatError.value = 'ส่งข้อความไม่สำเร็จ: ' + error.message
  } else if (data?.error) {
    chatError.value = data.error
  } else {
    chatMessages.value.push({ role: 'model', text: data.reply })
    scrollChatToBottom()
  }
  isSending.value = false
}

function askRegenerateMore() {
  sendChatMessage('ช่วยสรุปเนื้อหาใหม่ทั้งหมดให้ครบถ้วนและละเอียดมากขึ้นกว่าเดิม')
}

async function copyMessageText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Clipboard API ใช้ไม่ได้ (เช่น ไม่ใช่ HTTPS) — เงียบไว้ ไม่ใช่ Error ร้ายแรง
  }
}

// --- Quiz Tab: โชว์ Quiz ทั้งหมด "ของวิชานี้" — Pattern เดียวกับ Flashcard Tab ---
// หมายเหตุ: Schema ไม่มีความสัมพันธ์ตรงระหว่าง Summary กับ Quiz (คนละก้อนที่ Generate
// แยกกันจากเอกสารต้นทาง) จึงโชว์ตาม subject_id เดียวกันแทน ไม่ใช่ "Quiz ของ Summary นี้โดยเฉพาะ"
const quizzes = ref([])
const isLoadingQuizzes = ref(false)
const quizzesLoaded = ref(false)
const quizzesError = ref('')

async function loadQuizzesIfNeeded() {
  if (quizzesLoaded.value || !summary.value?.subject_id) return

  isLoadingQuizzes.value = true
  quizzesError.value = ''

  const { data, error } = await supabase
    .from('quizzes')
    .select('quiz_id, title, created_at')
    .eq('subject_id', summary.value.subject_id)
    .order('created_at', { ascending: false })

  if (error) quizzesError.value = 'โหลด Quiz ไม่สำเร็จ: ' + error.message
  else quizzes.value = data || []

  quizzesLoaded.value = true
  isLoadingQuizzes.value = false
}

// --- Flashcard Tab: โชว์ Flashcard Set ทั้งหมด "ของวิชานี้" ---
// หมายเหตุ: Schema ไม่มีความสัมพันธ์ตรงระหว่าง Summary กับ Flashcard Set
// (คนละก้อนที่ Generate แยกกันจากเอกสารต้นทาง) จึงโชว์ตาม subject_id
// เดียวกันแทน ไม่ใช่ "Flashcard ของ Summary นี้โดยเฉพาะ"
const flashcardSets = ref([])
const isLoadingFlashcards = ref(false)
const flashcardsLoaded = ref(false)
const flashcardsError = ref('')

async function loadFlashcardsIfNeeded() {
  if (flashcardsLoaded.value || !summary.value?.subject_id) return

  isLoadingFlashcards.value = true
  flashcardsError.value = ''

  const { data, error } = await supabase
    .from('flashcard_sets')
    .select('flashcard_set_id, title, created_at')
    .eq('subject_id', summary.value.subject_id)
    .order('created_at', { ascending: false })

  if (error) flashcardsError.value = 'โหลด Flashcard ไม่สำเร็จ: ' + error.message
  else flashcardSets.value = data || []

  flashcardsLoaded.value = true
  isLoadingFlashcards.value = false
}

function selectTab(tab) {
  activeTab.value = tab
  if (tab === 'quiz') loadQuizzesIfNeeded()
  if (tab === 'flashcard') loadFlashcardsIfNeeded()
}

function formatDateShort(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

async function fetchSummary() {
  isLoading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('summaries')
    .select('summary_id, content, created_at, updated_at, subject_id')
    .eq('summary_id', props.summaryId)
    .maybeSingle()

  if (error) {
    errorMessage.value = 'โหลด Summary ไม่สำเร็จ: ' + error.message
    isLoading.value = false
    return
  }
  if (!data) {
    errorMessage.value = 'ไม่พบ Summary นี้ หรือคุณไม่มีสิทธิ์เข้าถึง'
    isLoading.value = false
    return
  }

  summary.value = data

  // ดึงชื่อไฟล์ต้นทางทั้งหมดผ่าน Junction Table แทนการพึ่ง document_id เดี่ยว
  // (Summary ที่รวมจากหลายไฟล์จะมี document_id เป็น null)
  const { data: links } = await supabase
    .from('summary_documents')
    .select('documents ( file_name )')
    .eq('summary_id', props.summaryId)

  sourceFileNames.value = (links || []).map((l) => l.documents?.file_name).filter(Boolean)

  isLoading.value = false
}

function startEdit() {
  editedContent.value = summary.value.content
  saveError.value = ''
  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
  saveError.value = ''
}

async function saveEdit() {
  const content = editedContent.value.trim()
  if (!content) {
    toast.warning('เนื้อหาสรุปต้องไม่ว่างเปล่า', { title: 'บันทึกไม่ได้' })
    return
  }

  isSaving.value = true
  saveError.value = ''

  const { data, error } = await supabase
    .from('summaries')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('summary_id', props.summaryId)
    .select('summary_id, content, created_at, updated_at, subject_id')
    .single()

  if (error) {
    toast.error('บันทึกไม่สำเร็จ: ' + error.message)
  } else {
    summary.value = data
    isEditing.value = false
    toast.success('บันทึกสรุปแล้ว')
  }
  isSaving.value = false
}

function formatDateTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

const backLink = computed(() => {
  if (summary.value?.subject_id) {
    return { name: 'subject-workspace', params: { id: summary.value.subject_id } }
  }
  return { name: 'subjects' }
})

// --- ชื่อเรื่อง / เวลาอ่าน / สารบัญ (คำนวณจากเนื้อหา Markdown ฝั่ง Client ไม่แตะ DB) ---
const FIRST_H1 = /^\s*#\s+(.+)$/m

const summaryTitle = computed(() => {
  const m = (summary.value?.content || '').match(/^\s*#{1,3}\s+(.+)$/m)
  return m ? m[1].replace(/[*_`]/g, '').trim() : 'สรุปเนื้อหา'
})

// ถ้าเนื้อหาขึ้นต้นด้วย # หัวข้อ จะใช้เป็นชื่อเรื่องในส่วนหัว แล้วซ่อนตัวซ้ำในเนื้อหา
const hideFirstH1 = computed(() => /^\s*#\s+/.test(summary.value?.content || '') && FIRST_H1.test(summary.value?.content || ''))

// ภาษาไทยไม่เว้นวรรค ประมาณจากจำนวนตัวอักษร (~800 ตัวอักษร/นาที)
const readMinutes = computed(() => Math.max(1, Math.round((summary.value?.content || '').length / 800)))

const articleEl = ref(null)
const toc = ref([]) // [{ id, text, level }]
const activeTocId = ref('')
let tocObserver = null

function buildToc() {
  tocObserver?.disconnect()
  tocObserver = null
  toc.value = []
  const root = articleEl.value
  if (!root || isEditing.value) return

  const heads = [...root.querySelectorAll('h2, h3')]
  toc.value = heads.map((el, i) => {
    el.id = `sec-${i}`
    return { id: el.id, text: el.textContent.trim(), level: el.tagName === 'H3' ? 3 : 2 }
  })
  activeTocId.value = toc.value[0]?.id || ''
  if (heads.length === 0 || typeof IntersectionObserver === 'undefined') return

  tocObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible.length) activeTocId.value = visible[0].target.id
    },
    { rootMargin: '0px 0px -70% 0px' }
  )
  heads.forEach((h) => tocObserver.observe(h))
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// สร้างสารบัญใหม่ทุกครั้งที่เนื้อหาเปลี่ยน/สลับโหมดแก้ไข (v-html วาดใหม่แล้ว id ที่ใส่ไว้จะหาย)
watch(
  () => [summary.value?.content, isEditing.value, isLoading.value],
  () => nextTick(buildToc),
  { flush: 'post' }
)

onBeforeUnmount(() => tocObserver?.disconnect())

onMounted(fetchSummary)
</script>

<template>
  <div class="page">
    <RouterLink :to="backLink" class="back-link">← กลับไปหน้าวิชา</RouterLink>

    <p v-if="errorMessage" class="error-text" role="alert">{{ errorMessage }}</p>
    <p v-if="isLoading" class="status-text">กำลังโหลด...</p>

    <div v-else-if="summary" class="workspace">
      <!-- ฝั่งหลัก: Summary -->
      <div class="main-column">
        <header class="page-header">
          <div class="title-block">
            <h1>{{ summaryTitle }}</h1>
            <div class="chips">
              <span class="chip chip-primary">อ่านประมาณ {{ readMinutes }} นาที</span>
              <span class="chip">AI สรุปให้</span>
              <span class="chip">แก้ไขล่าสุด {{ formatDateTime(summary.updated_at) }}</span>
            </div>
            <p v-if="sourceFileNames.length" class="source-label">
              สร้างจาก {{ sourceFileNames.length }} ไฟล์: {{ sourceFileNames.join(', ') }}
            </p>
          </div>
          <div class="header-actions">
            <ShareButton content-type="summary" :content-id="summaryId" />
            <button v-if="!isEditing" class="edit-btn" @click="startEdit">แก้ไข</button>
          </div>
        </header>


        <article class="summary-card">
          <template v-if="isEditing">
            <textarea v-model="editedContent" class="edit-textarea" rows="20" aria-label="แก้ไขเนื้อหาสรุป"></textarea>
            <div class="edit-actions">
              <button class="save-btn" :disabled="isSaving" @click="saveEdit">
                {{ isSaving ? 'กำลังบันทึก...' : 'บันทึก' }}
              </button>
              <button class="cancel-btn" :disabled="isSaving" @click="cancelEdit">ยกเลิก</button>
            </div>
          </template>
          <div v-else ref="articleEl" class="summary-body" :class="{ 'hide-first-h1': hideFirstH1 }">
            <MarkdownContent :source="summary.content" />
          </div>
        </article>
      </div>

      <!-- ฝั่งขวา: สารบัญ + Studio Panel (Chat / Quiz / Flashcard) -->
      <div class="side-column">
        <nav v-if="toc.length >= 2" class="toc-card" aria-label="สารบัญ">
          <div class="side-title">สารบัญ</div>
          <ul class="toc-list">
            <li v-for="item in toc" :key="item.id">
              <button
                type="button"
                class="toc-item"
                :class="{ 'is-active': activeTocId === item.id, 'is-sub': item.level === 3 }"
                @click="scrollToSection(item.id)"
              >
                {{ item.text }}
              </button>
            </li>
          </ul>
        </nav>

        <aside class="studio-panel">
                <div class="studio-tabs">
                  <button
                    class="studio-tab"
                    :class="{ active: activeTab === 'chat' }"
                    @click="activeTab = 'chat'"
                  >
                    แชท
                  </button>
                  <button
                    class="studio-tab"
                    :class="{ active: activeTab === 'quiz' }"
                    @click="selectTab('quiz')"
                  >
                    Quiz
                  </button>
                  <button
                    class="studio-tab"
                    :class="{ active: activeTab === 'flashcard' }"
                    @click="selectTab('flashcard')"
                  >
                    Flashcard
                  </button>
                </div>
        
                <div v-if="activeTab === 'chat'" class="chat-panel">
                  <p class="chat-hint">
                    ถามคำถามหรือสั่งงาน AI เพิ่มเติมได้ อ้างอิงจากเอกสารต้นทางของ Summary นี้เท่านั้น
                    (แชทนี้ไม่ถูกบันทึก จะหายเมื่อรีเฟรชหน้า)
                  </p>
        
                  <p v-if="chatDisabled" class="chat-disabled-notice">
                    ไม่สามารถใช้งานได้เนื่องจากไฟล์หลักถูกลบไปแล้ว
                  </p>
        
                  <button class="quick-action-btn" :disabled="isSending || chatDisabled" @click="askRegenerateMore">
                    ✨ ขอสรุปใหม่ให้ครบขึ้น
                  </button>
        
                  <div ref="chatScrollEl" class="chat-messages">
                    <p v-if="chatMessages.length === 0" class="chat-empty">
                      ยังไม่มีข้อความ — ลองถามคำถามหรือกดปุ่มด้านบนได้เลย
                    </p>
                    <div
                      v-for="(msg, i) in chatMessages"
                      :key="i"
                      class="chat-bubble"
                      :class="msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-model'"
                    >
                      <MarkdownContent v-if="msg.role === 'model'" class="chat-bubble-text" :source="msg.text" breaks />
                      <div v-else class="chat-bubble-text">{{ msg.text }}</div>
                      <button
                        v-if="msg.role === 'model'"
                        class="copy-btn"
                        title="คัดลอกข้อความนี้"
                        @click="copyMessageText(msg.text)"
                      >
                        คัดลอก
                      </button>
                    </div>
                    <p v-if="isSending" class="chat-typing">AI กำลังพิมพ์...</p>
                  </div>
        
                  <p v-if="chatError" class="error-text">{{ chatError }}</p>
        
                  <div class="chat-input-row">
                    <input
                      v-model="chatInput"
                      type="text"
                      class="chat-input"
                      placeholder="พิมพ์คำถามหรือคำสั่ง..."
                      :disabled="isSending || chatDisabled"
                      @keyup.enter="sendChatMessage()"
                    />
                    <button class="send-btn" :disabled="isSending || chatDisabled || !chatInput.trim()" @click="sendChatMessage()">
                      ส่ง
                    </button>
                  </div>
                </div>
        
                <div v-else-if="activeTab === 'quiz'" class="flashcard-tab">
                  <p class="chat-hint">
                    Quiz ทั้งหมดในวิชานี้ (ไม่จำกัดเฉพาะที่มาจากไฟล์เดียวกับ Summary นี้)
                  </p>
        
                  <p v-if="isLoadingQuizzes" class="status-text">กำลังโหลด...</p>
                  <p v-if="quizzesError" class="error-text">{{ quizzesError }}</p>
                  <p v-if="quizzesLoaded && !isLoadingQuizzes && quizzes.length === 0" class="chat-empty">
                    ยังไม่มี Quiz ในวิชานี้ — ไปสร้างได้จากหน้าวิชา
                  </p>
        
                  <ul v-if="quizzes.length > 0" class="flashcard-mini-list">
                    <li v-for="q in quizzes" :key="q.quiz_id" class="quiz-mini-item">
                      <RouterLink :to="{ name: 'quiz-practice', params: { quizId: q.quiz_id } }" class="quiz-mini-main">
                        <span class="flashcard-mini-title">{{ q.title }}</span>
                        <span class="flashcard-mini-date">{{ formatDateShort(q.created_at) }}</span>
                      </RouterLink>
                      <RouterLink :to="{ name: 'quiz-detail', params: { quizId: q.quiz_id } }" class="quiz-mini-review">
                        ตรวจสอบ/แก้ไข
                      </RouterLink>
                    </li>
                  </ul>
                </div>
        
                <div v-else-if="activeTab === 'flashcard'" class="flashcard-tab">
                  <p class="chat-hint">
                    Flashcard ทั้งหมดในวิชานี้ (ไม่จำกัดเฉพาะที่มาจากไฟล์เดียวกับ Summary นี้)
                  </p>
        
                  <p v-if="isLoadingFlashcards" class="status-text">กำลังโหลด...</p>
                  <p v-if="flashcardsError" class="error-text">{{ flashcardsError }}</p>
                  <p v-if="flashcardsLoaded && !isLoadingFlashcards && flashcardSets.length === 0" class="chat-empty">
                    ยังไม่มี Flashcard ในวิชานี้ — ไปสร้างได้จากหน้าวิชา
                  </p>
        
                  <ul v-if="flashcardSets.length > 0" class="flashcard-mini-list">
                    <li v-for="f in flashcardSets" :key="f.flashcard_set_id">
                      <RouterLink :to="{ name: 'flashcard-set-detail', params: { flashcardSetId: f.flashcard_set_id } }">
                        <span class="flashcard-mini-title">{{ f.title }}</span>
                        <span class="flashcard-mini-date">{{ formatDateShort(f.created_at) }}</span>
                      </RouterLink>
                    </li>
                  </ul>
                </div>
              </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 1320px;
  margin: 0 auto;
  padding: 1.75rem 2.5rem 4rem;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 1.5rem;
  align-items: start;
}

@media (max-width: 1100px) {
  .workspace {
    grid-template-columns: 1fr;
  }
  .page {
    padding: 1.25rem 1rem 3rem;
  }
}

.back-link {
  display: inline-block;
  color: var(--text-muted);
  font-size: 0.85rem;
  text-decoration: none;
  margin-bottom: 1.1rem;
}

.back-link:hover {
  color: var(--primary);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.25rem;
  margin-bottom: 1.25rem;
}

.title-block {
  min-width: 0;
}

.page-header h1 {
  font-family: var(--font-serif);
  font-size: 1.9rem;
  line-height: 1.4;
  margin: 0 0 0.8rem;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.chip {
  padding: 0.2rem 0.75rem;
  border-radius: 99px;
  background: var(--hover);
  color: var(--text-muted);
  font-size: 0.8rem;
}

.chip-primary {
  color: var(--primary);
  font-weight: 600;
}

.source-label {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0.7rem 0 0;
}

.header-actions {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  flex-shrink: 0;
}

.edit-btn {
  padding: 0.5rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 0.85rem;
  cursor: pointer;
}

.edit-btn:hover {
  background: var(--hover);
}

.status-text {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.error-text {
  color: var(--danger);
  background: var(--danger-bg);
  border-radius: 10px;
  padding: 0.6rem 0.9rem;
  font-size: 0.85rem;
}

/* --- บทความ --- */
.summary-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 2.5rem 3rem;
  box-shadow: var(--shadow-card);
}

.summary-body {
  font-size: 1.05rem;
  line-height: 1.9;
}

.summary-body.hide-first-h1 :deep(.md > h1:first-child) {
  display: none;
}

@media (max-width: 700px) {
  .summary-card {
    padding: 1.5rem 1.25rem;
  }
}

.edit-textarea {
  width: 100%;
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 0.95rem;
  line-height: 1.7;
  resize: vertical;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.9rem;
}

.save-btn {
  padding: 0.55rem 1.2rem;
  border-radius: 10px;
  border: none;
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
}

.cancel-btn {
  padding: 0.55rem 1.2rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.88rem;
  cursor: pointer;
}

.save-btn:disabled,
.cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- คอลัมน์ขวา --- */
.side-column {
  position: sticky;
  top: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: calc(100vh - 2.5rem);
}

@media (max-width: 1100px) {
  .side-column {
    position: static;
    max-height: none;
  }
}

.toc-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 1.1rem 1.2rem;
  flex: none;
}

.side-title {
  font-size: 1.02rem;
  font-weight: 600;
  margin-bottom: 0.6rem;
}

.toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 210px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.toc-item {
  width: 100%;
  text-align: left;
  border: 0;
  background: none;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--text-muted);
  cursor: pointer;
}

.toc-item.is-sub {
  padding-left: 1.4rem;
  font-size: 0.8rem;
}

.toc-item:hover {
  background: var(--hover);
}

.toc-item.is-active {
  background: var(--hover);
  color: var(--primary);
  font-weight: 600;
}

/* --- Studio Panel --- */
.studio-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 360px;
  min-height: min(520px, 60vh);
  overflow: hidden;
}

.studio-tabs {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.9rem;
  padding: 3px;
  border-radius: 12px;
  background: var(--hover);
}

.studio-tab {
  flex: 1;
  padding: 0.5rem 0.4rem;
  border-radius: 9px;
  border: 0;
  background: none;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
}

.studio-tab.active {
  background: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-card);
}

/* --- Chat --- */
.chat-panel,
.flashcard-tab {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.flashcard-tab {
  overflow-y: auto;
}

.chat-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0 0 0.75rem;
}

.chat-disabled-notice {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--warning);
  background: var(--warning-bg);
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
  margin: 0 0 0.9rem;
}

.quick-action-btn {
  width: 100%;
  padding: 0.55rem 0.8rem;
  margin-bottom: 0.75rem;
  border-radius: 10px;
  border: 0;
  background: var(--hover);
  color: var(--primary);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.quick-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-messages {
  flex: 1;
  min-height: 140px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.2rem 0.1rem;
}

.chat-empty {
  font-size: 0.82rem;
  color: var(--text-muted);
  text-align: center;
  padding: 1rem 0.5rem;
}

.chat-bubble {
  max-width: 92%;
  padding: 0.6rem 0.85rem;
  border-radius: 14px;
  font-size: 0.88rem;
  line-height: 1.6;
}

.chat-bubble-user {
  align-self: flex-end;
  background: var(--primary);
  color: var(--on-primary);
}

.chat-bubble-model {
  align-self: flex-start;
  background: var(--hover);
  color: var(--text);
}

.chat-bubble-text {
  word-break: break-word;
}

.copy-btn {
  margin-top: 0.4rem;
  border: 0;
  background: none;
  padding: 0;
  font-size: 0.72rem;
  color: var(--text-muted);
  cursor: pointer;
  text-decoration: underline;
}

.chat-typing {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}

.chat-input-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.chat-input {
  flex: 1;
  min-width: 0;
  padding: 0.6rem 0.8rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 0.88rem;
}

.chat-input:disabled {
  opacity: 0.55;
}

.send-btn {
  padding: 0.6rem 1rem;
  border-radius: 10px;
  border: none;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- รายการ Quiz / Flashcard ในแผง --- */
.flashcard-mini-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.flashcard-mini-list li:not(.quiz-mini-item) > a {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  color: inherit;
  text-decoration: none;
}

.flashcard-mini-list li:not(.quiz-mini-item) > a:hover {
  background: var(--hover);
}

.flashcard-mini-title {
  font-size: 0.88rem;
  font-weight: 600;
}

.flashcard-mini-date {
  font-size: 0.74rem;
  color: var(--text-muted);
}

.quiz-mini-item {
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.quiz-mini-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.65rem 0.8rem;
  color: inherit;
  text-decoration: none;
}

.quiz-mini-item:hover {
  background: var(--hover);
}

.quiz-mini-review {
  display: flex;
  align-items: center;
  padding: 0 0.8rem;
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--primary);
  text-decoration: none;
  white-space: nowrap;
}

.quiz-mini-review:hover {
  text-decoration: underline;
}
</style>
