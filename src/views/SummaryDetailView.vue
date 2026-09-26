<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../supabaseClient'

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
    saveError.value = 'เนื้อหาต้องไม่ว่างเปล่า'
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
    saveError.value = 'บันทึกไม่สำเร็จ: ' + error.message
  } else {
    summary.value = data
    isEditing.value = false
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

onMounted(fetchSummary)
</script>

<template>
  <div class="page">
    <RouterLink :to="backLink" class="back-link">← กลับไปหน้าวิชา</RouterLink>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    <p v-if="isLoading" class="status-text">กำลังโหลด...</p>

    <div v-else-if="summary" class="workspace">
      <!-- ฝั่งหลัก: Summary -->
      <div class="main-column">
        <header class="page-header">
          <div>
            <span class="ai-badge">AI สรุปให้</span>
            <h1>สรุปเนื้อหา</h1>
            <p v-if="sourceFileNames.length" class="source-label">
              สร้างจาก {{ sourceFileNames.length }} ไฟล์: {{ sourceFileNames.join(', ') }}
            </p>
            <p class="timestamp-label">แก้ไขล่าสุด {{ formatDateTime(summary.updated_at) }}</p>
          </div>
          <button v-if="!isEditing" class="edit-btn" @click="startEdit">แก้ไข</button>
        </header>

        <p v-if="saveError" class="error-text">{{ saveError }}</p>

        <template v-if="isEditing">
          <textarea v-model="editedContent" class="edit-textarea" rows="16"></textarea>
          <div class="edit-actions">
            <button class="save-btn" :disabled="isSaving" @click="saveEdit">
              {{ isSaving ? 'กำลังบันทึก...' : 'บันทึก' }}
            </button>
            <button class="cancel-btn" :disabled="isSaving" @click="cancelEdit">ยกเลิก</button>
          </div>
        </template>

        <div v-else class="summary-content">{{ summary.content }}</div>
      </div>

      <!-- ฝั่งขวา: Studio Panel (Chat / Quiz / Flashcard) -->
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
          </button>          <button
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
              <div class="chat-bubble-text">{{ msg.text }}</div>
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
</template>

<style scoped>
.page {
  max-width: 1120px;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}

.workspace {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 1.75rem;
  align-items: start;
}

@media (max-width: 880px) {
  .workspace {
    grid-template-columns: 1fr;
  }
}

.back-link {
  display: inline-block;
  color: var(--ink-soft);
  font-size: 0.85rem;
  text-decoration: none;
  margin-bottom: 1.25rem;
}

.back-link:hover {
  text-decoration: underline;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.ai-badge {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 700;
  color: #8a6d1a;
  background: var(--highlighter-soft);
  border: 1px solid var(--highlighter);
  padding: 0.1rem 0.45rem;
  border-radius: 6px;
  margin-bottom: 0.5rem;
}

.page-header h1 {
  font-size: 1.5rem;
  margin: 0 0 0.4rem;
}

.source-label {
  font-size: 0.85rem;
  color: var(--ink-soft);
  margin: 0 0 0.2rem;
}

.timestamp-label {
  font-size: 0.78rem;
  color: var(--ink-faint);
  margin: 0;
}

.edit-btn {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--indigo);
  background: #ffffff;
  color: var(--indigo);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
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

.summary-content {
  padding: 1.35rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 0.95rem;
  line-height: 1.85;
  white-space: pre-wrap;
}

.edit-textarea {
  width: 100%;
  padding: 1rem;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  font-size: 0.95rem;
  line-height: 1.7;
  font-family: var(--font-body);
  resize: vertical;
  box-sizing: border-box;
}

.edit-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.75rem;
}

.save-btn {
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  border: none;
  background: var(--indigo);
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-btn {
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: none;
  font-size: 0.85rem;
  cursor: pointer;
}

.cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- Studio Panel --- */
.studio-panel {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
  position: sticky;
  top: 1.5rem;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 3rem);
}

.studio-tabs {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.9rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.75rem;
}

.studio-tab {
  flex: 1;
  padding: 0.5rem 0.4rem;
  border-radius: 8px;
  border: 1px solid transparent;
  background: none;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}

.studio-tab.active {
  background: var(--paper);
  border-color: var(--border-strong);
  color: var(--indigo);
}

.studio-tab.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.soon-label {
  font-size: 0.62rem;
  font-weight: 500;
}

/* --- Chat --- */
.chat-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.chat-hint {
  font-size: 0.75rem;
  color: var(--ink-faint);
  line-height: 1.5;
  margin: 0 0 0.75rem;
}

.chat-disabled-notice {
  font-size: 0.82rem;
  font-weight: 600;
  color: #8a5a00;
  background: #fdf0d5;
  border: 1px solid #f0d089;
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  margin: 0 0 0.9rem;
}

.quick-action-btn {
  width: 100%;
  padding: 0.5rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--highlighter);
  background: var(--highlighter-soft);
  color: #6b5200;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 0.9rem;
}

.quick-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-messages {
  flex: 1;
  min-height: 220px;
  max-height: 420px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
  padding-right: 0.2rem;
}

.chat-empty {
  font-size: 0.8rem;
  color: var(--ink-faint);
  text-align: center;
  margin-top: 1.5rem;
}

.chat-bubble {
  max-width: 92%;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  font-size: 0.85rem;
  line-height: 1.6;
  white-space: pre-wrap;
}

.chat-bubble-user {
  align-self: flex-end;
  background: var(--indigo);
  color: #ffffff;
  border-bottom-right-radius: 2px;
}

.chat-bubble-model {
  align-self: flex-start;
  background: var(--paper);
  border: 1px solid var(--border);
  border-bottom-left-radius: 2px;
}

.chat-bubble-text {
  margin: 0;
}

.copy-btn {
  margin-top: 0.4rem;
  border: none;
  background: none;
  color: var(--indigo);
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.chat-typing {
  font-size: 0.78rem;
  color: var(--ink-faint);
  font-style: italic;
}

.chat-input-row {
  display: flex;
  gap: 0.5rem;
}

.chat-input {
  flex: 1;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  font-size: 0.85rem;
  font-family: var(--font-body);
}

.chat-input:disabled {
  opacity: 0.6;
}

.send-btn {
  padding: 0.55rem 1rem;
  border-radius: 8px;
  border: none;
  background: var(--indigo);
  color: #ffffff;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- Flashcard Tab --- */
.flashcard-mini-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.flashcard-mini-list a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  text-decoration: none;
  color: var(--ink);
}

.flashcard-mini-list a:hover {
  border-color: var(--indigo);
}

.flashcard-mini-title {
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flashcard-mini-date {
  font-size: 0.72rem;
  color: var(--ink-faint);
  white-space: nowrap;
}

.quiz-mini-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.quiz-mini-item .quiz-mini-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  text-decoration: none;
  color: var(--ink);
  min-width: 0;
}

.quiz-mini-item:hover {
  border-color: var(--indigo);
}

.quiz-mini-review {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--indigo);
  text-decoration: none;
  padding: 0.4rem 0.6rem;
  white-space: nowrap;
}

.quiz-mini-review:hover {
  text-decoration: underline;
}
</style>