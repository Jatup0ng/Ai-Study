<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../supabaseClient'
import ShareButton from '../component/ShareButton.vue'
import MarkdownContent from '../component/MarkdownContent.vue'

const props = defineProps({
  quizId: { type: String, required: true }
})

const quiz = ref(null) // { quiz_id, title, created_at, subject_id }
const questions = ref([]) // [{ question_id, question_text, explanation, choices: [{choice_id, choice_text, is_correct}] }]
const sourceFileNames = ref([])

const isLoading = ref(true)
const errorMessage = ref('')

const isEditingTitle = ref(false)
const editedTitle = ref('')
const isSavingTitle = ref(false)

// เก็บ Draft การแก้ไขแยกตาม question_id — เปิดแก้ทีละข้อได้อิสระ ไม่ต้องแก้ทั้งหน้าพร้อมกัน
const editingQuestionId = ref(null)
const draftQuestionText = ref('')
const draftExplanation = ref('')
const draftChoices = ref([]) // [{ choice_id, choice_text, is_correct }]
const isSavingQuestion = ref(false)
const saveQuestionError = ref('')

const deletingQuestionId = ref(null)

// ข้อที่เลือกดู/แก้ไขอยู่ (แสดงตรงกลาง)
const selectedId = ref(null)

async function fetchQuiz() {
  isLoading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('quizzes')
    .select('quiz_id, title, created_at, subject_id')
    .eq('quiz_id', props.quizId)
    .maybeSingle()

  if (error) {
    errorMessage.value = 'โหลด Quiz ไม่สำเร็จ: ' + error.message
    isLoading.value = false
    return
  }
  if (!data) {
    errorMessage.value = 'ไม่พบ Quiz นี้ หรือคุณไม่มีสิทธิ์เข้าถึง'
    isLoading.value = false
    return
  }

  quiz.value = data

  const [{ data: links }, { data: qRows }] = await Promise.all([
    supabase.from('quiz_documents').select('documents ( file_name )').eq('quiz_id', props.quizId),
    supabase
      .from('questions')
      .select('question_id, question_text, explanation, choices ( choice_id, choice_text, is_correct )')
      .eq('quiz_id', props.quizId)
      .order('question_id', { ascending: true })
  ])

  sourceFileNames.value = (links || []).map((l) => l.documents?.file_name).filter(Boolean)
  // เรียง Choice ตาม choice_id ให้ลำดับ A/B/C/D คงที่ทุกครั้งที่โหลด
  questions.value = (qRows || []).map((q) => ({
    ...q,
    choices: [...(q.choices || [])].sort((a, b) => a.choice_id - b.choice_id)
  }))

  selectedId.value = questions.value[0]?.question_id ?? null
  isLoading.value = false
}

function startEditTitle() {
  editedTitle.value = quiz.value.title
  isEditingTitle.value = true
}

async function saveTitle() {
  const title = editedTitle.value.trim()
  if (!title) return

  isSavingTitle.value = true
  const { data, error } = await supabase
    .from('quizzes')
    .update({ title })
    .eq('quiz_id', props.quizId)
    .select('quiz_id, title, created_at, subject_id')
    .single()

  if (!error) {
    quiz.value = data
    isEditingTitle.value = false
  } else {
    errorMessage.value = 'แก้ไขชื่อ Quiz ไม่สำเร็จ: ' + error.message
  }
  isSavingTitle.value = false
}

function startEditQuestion(q) {
  editingQuestionId.value = q.question_id
  draftQuestionText.value = q.question_text
  draftExplanation.value = q.explanation || ''
  draftChoices.value = q.choices.map((c) => ({ ...c }))
  saveQuestionError.value = ''
}

function cancelEditQuestion() {
  editingQuestionId.value = null
  saveQuestionError.value = ''
}

function setCorrectChoice(choiceId) {
  draftChoices.value = draftChoices.value.map((c) => ({ ...c, is_correct: c.choice_id === choiceId }))
}

async function saveQuestion() {
  const text = draftQuestionText.value.trim()
  if (!text) {
    saveQuestionError.value = 'คำถามต้องไม่ว่างเปล่า'
    return
  }
  if (draftChoices.value.some((c) => !c.choice_text.trim())) {
    saveQuestionError.value = 'ตัวเลือกทุกข้อต้องไม่ว่างเปล่า'
    return
  }
  if (!draftChoices.value.some((c) => c.is_correct)) {
    saveQuestionError.value = 'ต้องเลือกคำตอบที่ถูกต้อง 1 ข้อ'
    return
  }

  isSavingQuestion.value = true
  saveQuestionError.value = ''

  const questionId = editingQuestionId.value

  const { error: qErr } = await supabase
    .from('questions')
    .update({ question_text: text, explanation: draftExplanation.value.trim() || null })
    .eq('question_id', questionId)

  if (qErr) {
    saveQuestionError.value = 'บันทึกคำถามไม่สำเร็จ: ' + qErr.message
    isSavingQuestion.value = false
    return
  }

  const choiceUpdates = await Promise.all(
    draftChoices.value.map((c) =>
      supabase
        .from('choices')
        .update({ choice_text: c.choice_text.trim(), is_correct: c.is_correct })
        .eq('choice_id', c.choice_id)
    )
  )
  const choiceErr = choiceUpdates.find((r) => r.error)

  if (choiceErr) {
    saveQuestionError.value = 'บันทึกตัวเลือกบางข้อไม่สำเร็จ: ' + choiceErr.error.message
    isSavingQuestion.value = false
    return
  }

  const idx = questions.value.findIndex((q) => q.question_id === questionId)
  if (idx !== -1) {
    questions.value[idx] = {
      question_id: questionId,
      question_text: text,
      explanation: draftExplanation.value.trim() || null,
      choices: draftChoices.value.map((c) => ({ ...c, choice_text: c.choice_text.trim() }))
    }
  }

  editingQuestionId.value = null
  isSavingQuestion.value = false
}

async function handleDeleteQuestion(q) {
  if (!confirm('ต้องการลบคำถามนี้ใช่หรือไม่? การลบนี้ไม่สามารถกู้คืนได้')) return

  deletingQuestionId.value = q.question_id
  const { error } = await supabase.from('questions').delete().eq('question_id', q.question_id)

  if (error) {
    errorMessage.value = 'ลบคำถามไม่สำเร็จ: ' + error.message
  } else {
    const idx = questions.value.findIndex((item) => item.question_id === q.question_id)
    questions.value = questions.value.filter((item) => item.question_id !== q.question_id)
    if (selectedId.value === q.question_id) {
      selectedId.value = (questions.value[idx] || questions.value[idx - 1])?.question_id ?? null
    }
  }
  deletingQuestionId.value = null
}

function formatDateTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

const backLink = computed(() => {
  if (quiz.value?.subject_id) {
    return { name: 'subject-workspace', params: { id: quiz.value.subject_id } }
  }
  return { name: 'subjects' }
})

const choiceLabels = ['A', 'B', 'C', 'D', 'E', 'F']

const selectedIndex = computed(() => questions.value.findIndex((q) => q.question_id === selectedId.value))
const selectedQuestion = computed(() => questions.value[selectedIndex.value] || null)

function selectQuestion(id) {
  if (editingQuestionId.value) return // กำลังแก้ไขอยู่ ต้องบันทึกหรือยกเลิกก่อน
  selectedId.value = id
}

// ข้อความย่อสำหรับรายการข้อทางซ้าย (ตัดสัญลักษณ์ Markdown/สูตรคร่าว ๆ)
function shortText(text) {
  const plain = (text || '').replace(/[*_`#>$]/g, '').replace(/\s+/g, ' ').trim()
  return plain.length > 60 ? plain.slice(0, 60) + '…' : plain
}

onMounted(fetchQuiz)
</script>

<template>
  <div class="page">
    <RouterLink :to="backLink" class="back-link">← กลับไปหน้าวิชา</RouterLink>

    <p v-if="errorMessage" class="error-text" role="alert">{{ errorMessage }}</p>
    <p v-if="isLoading" class="status-text">กำลังโหลด...</p>

    <template v-else-if="quiz">
      <header class="page-header">
        <div class="header-main">
          <template v-if="isEditingTitle">
            <input v-model="editedTitle" type="text" class="title-input" aria-label="ชื่อ Quiz" />
            <div class="title-actions">
              <button class="save-btn" :disabled="isSavingTitle || !editedTitle.trim()" @click="saveTitle">
                {{ isSavingTitle ? 'กำลังบันทึก...' : 'บันทึก' }}
              </button>
              <button class="cancel-btn" :disabled="isSavingTitle" @click="isEditingTitle = false">ยกเลิก</button>
            </div>
          </template>
          <template v-else>
            <h1 title="คลิกเพื่อแก้ไขชื่อ" @click="startEditTitle">{{ quiz.title }}</h1>
          </template>

          <div class="chips">
            <span class="chip chip-primary">{{ questions.length }} ข้อ</span>
            <span class="chip">AI ออกข้อสอบให้</span>
            <span class="chip">สร้างเมื่อ {{ formatDateTime(quiz.created_at) }}</span>
          </div>
        </div>

        <div class="header-actions">
          <ShareButton content-type="quiz" :content-id="quizId" />
          <RouterLink
            :to="{ name: 'quiz-practice', params: { quizId } }"
            class="practice-btn"
          >
            ทำ Quiz นี้
          </RouterLink>
        </div>
      </header>

      <p v-if="questions.length === 0" class="status-text">Quiz นี้ไม่มีคำถามเหลืออยู่แล้ว</p>

      <div v-else class="layout">
        <!-- ซ้าย: รายการข้อ -->
        <nav class="list-card" aria-label="รายการข้อสอบ">
          <div class="list-head">{{ questions.length }} ข้อ</div>
          <ul class="q-list">
            <li v-for="(q, i) in questions" :key="q.question_id">
              <button
                type="button"
                class="q-item"
                :class="{ 'is-active': q.question_id === selectedId }"
                :disabled="!!editingQuestionId && q.question_id !== selectedId"
                @click="selectQuestion(q.question_id)"
              >
                <span class="q-num">{{ i + 1 }}</span>
                <span class="q-short">{{ shortText(q.question_text) }}</span>
              </button>
            </li>
          </ul>
        </nav>

        <!-- กลาง: ดู/แก้ไขข้อที่เลือก -->
        <section v-if="selectedQuestion" class="editor-card">
          <template v-if="editingQuestionId === selectedQuestion.question_id">
            <div class="editor-head"><b>แก้ไขข้อที่ {{ selectedIndex + 1 }}</b></div>

            <label class="field-label" for="q-text">โจทย์</label>
            <textarea id="q-text" v-model="draftQuestionText" class="edit-textarea" rows="3"></textarea>

            <div class="field-label">ตัวเลือก (เลือกวงกลมที่เป็นคำตอบที่ถูก)</div>
            <div class="choice-edit-list">
              <div v-for="(c, ci) in draftChoices" :key="c.choice_id" class="choice-edit-row">
                <input
                  type="radio"
                  :name="'correct-' + selectedQuestion.question_id"
                  :checked="c.is_correct"
                  :aria-label="'ตัวเลือก ' + choiceLabels[ci] + ' เป็นคำตอบที่ถูก'"
                  @change="setCorrectChoice(c.choice_id)"
                />
                <span class="choice-label">{{ choiceLabels[ci] }}</span>
                <input v-model="c.choice_text" type="text" class="choice-input" :aria-label="'ตัวเลือก ' + choiceLabels[ci]" />
              </div>
            </div>

            <label class="field-label" for="q-exp">คำอธิบายเฉลย</label>
            <textarea id="q-exp" v-model="draftExplanation" class="edit-textarea" rows="3"></textarea>

            <p v-if="saveQuestionError" class="error-text" role="alert">{{ saveQuestionError }}</p>

            <div class="edit-actions">
              <button class="save-btn" :disabled="isSavingQuestion" @click="saveQuestion">
                {{ isSavingQuestion ? 'กำลังบันทึก...' : 'บันทึก' }}
              </button>
              <button class="cancel-btn" :disabled="isSavingQuestion" @click="cancelEditQuestion">ยกเลิก</button>
            </div>
          </template>

          <template v-else>
            <div class="editor-head">
              <b>ข้อที่ {{ selectedIndex + 1 }}</b>
              <div class="question-actions">
                <button class="edit-btn" @click="startEditQuestion(selectedQuestion)">แก้ไข</button>
                <button
                  class="delete-btn"
                  :disabled="deletingQuestionId === selectedQuestion.question_id"
                  @click="handleDeleteQuestion(selectedQuestion)"
                >
                  {{ deletingQuestionId === selectedQuestion.question_id ? '...' : 'ลบ' }}
                </button>
              </div>
            </div>

            <div class="question-text"><MarkdownContent inline :source="selectedQuestion.question_text" /></div>

            <ul class="choice-list">
              <li
                v-for="(c, ci) in selectedQuestion.choices"
                :key="c.choice_id"
                class="choice-item"
                :class="{ 'is-correct': c.is_correct }"
              >
                <span class="choice-label">{{ choiceLabels[ci] }}</span>
                <span class="choice-text"><MarkdownContent inline :source="c.choice_text" /></span>
                <span v-if="c.is_correct" class="correct-tag">✓ คำตอบที่ถูก</span>
              </li>
            </ul>

            <div v-if="selectedQuestion.explanation" class="explanation">
              <b>คำอธิบายเฉลย</b>
              <div><MarkdownContent inline :source="selectedQuestion.explanation" /></div>
            </div>
          </template>
        </section>

        <!-- ขวา: ข้อมูลชุดข้อสอบ -->
        <aside class="info-col">
          <div class="info-card">
            <div class="info-title">เกี่ยวกับชุดข้อสอบ</div>
            <dl class="info-list">
              <div><dt>จำนวนข้อ</dt><dd>{{ questions.length }}</dd></div>
              <div><dt>สร้างเมื่อ</dt><dd>{{ formatDateTime(quiz.created_at) }}</dd></div>
            </dl>
            <div v-if="sourceFileNames.length" class="source-box">
              <div class="source-title">สร้างจาก {{ sourceFileNames.length }} ไฟล์</div>
              <ul>
                <li v-for="n in sourceFileNames" :key="n">{{ n }}</li>
              </ul>
            </div>
          </div>
          <div class="info-card tip-card">
            <div class="info-title">ก่อนนำไปใช้จริง</div>
            <p>
              ตรวจสอบความถูกต้องของคำถามและเฉลยก่อนทำหรือแชร์ให้เพื่อน เลือกข้อทางซ้ายแล้วกด “แก้ไข” เพื่อปรับได้เลย
            </p>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 1.75rem 2.5rem 4rem;
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
  margin-bottom: 1.5rem;
}

.header-main {
  min-width: 0;
  flex: 1;
}

.page-header h1 {
  font-size: 1.8rem;
  margin: 0 0 0.8rem;
  cursor: text;
}

.title-input {
  width: 100%;
  max-width: 480px;
  padding: 0.5rem 0.8rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 1.3rem;
  font-weight: 700;
}

.title-actions {
  display: flex;
  gap: 0.5rem;
  margin: 0.6rem 0 0.8rem;
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

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  flex-shrink: 0;
}

.practice-btn {
  padding: 0.55rem 1.2rem;
  border-radius: 10px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none;
}

.practice-btn:hover {
  background: var(--primary-strong);
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

.layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 280px;
  gap: 1.25rem;
  align-items: start;
}

@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .page {
    padding: 1.25rem 1rem 3rem;
  }
}

.list-card,
.editor-card,
.info-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: var(--shadow-card);
}

.list-card {
  padding: 0.9rem;
  position: sticky;
  top: 1.25rem;
  max-height: calc(100vh - 2.5rem);
  overflow-y: auto;
}

@media (max-width: 1100px) {
  .list-card {
    position: static;
    max-height: 280px;
  }
}

.list-head {
  font-weight: 600;
  padding: 0.3rem 0.5rem 0.7rem;
}

.q-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.q-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.6rem 0.6rem;
  border: 1px solid transparent;
  border-radius: 12px;
  background: none;
  color: var(--text);
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}

.q-item:hover:not(:disabled) {
  background: var(--hover);
}

.q-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.q-item.is-active {
  background: var(--hover);
  border-color: var(--primary);
}

.q-num {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 0.78rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.q-short {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-card {
  padding: 1.75rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.editor-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.05rem;
}

.question-actions {
  display: flex;
  gap: 0.5rem;
}

.question-text {
  font-family: var(--font-serif);
  font-size: 1.25rem;
  line-height: 1.6;
}

.choice-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.choice-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.8rem 1rem;
  border: 1px solid var(--border);
  border-radius: 12px;
}

.choice-item.is-correct {
  border-color: var(--success);
  background: var(--success-bg);
}

.choice-text {
  flex: 1;
  min-width: 0;
}

.choice-label {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
}

.correct-tag {
  flex: none;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--success);
}

.explanation {
  background: var(--info-bg);
  color: var(--info);
  border-radius: 12px;
  padding: 0.9rem 1.1rem;
  font-size: 0.92rem;
  line-height: 1.7;
}

.field-label {
  font-size: 0.88rem;
  font-weight: 600;
  margin-top: 0.4rem;
}

.edit-textarea,
.choice-input {
  width: 100%;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 0.95rem;
  line-height: 1.6;
  resize: vertical;
}

.choice-edit-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.choice-edit-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.choice-edit-row input[type='radio'] {
  accent-color: var(--primary);
  width: 18px;
  height: 18px;
  flex: none;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.4rem;
}

.save-btn,
.cancel-btn,
.edit-btn,
.delete-btn {
  padding: 0.45rem 1rem;
  border-radius: 10px;
  font-size: 0.85rem;
  cursor: pointer;
}

.save-btn {
  border: none;
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 600;
}

.cancel-btn,
.edit-btn {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
}

.edit-btn:hover,
.cancel-btn:hover:not(:disabled) {
  background: var(--hover);
}

.delete-btn {
  border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border));
  background: none;
  color: var(--danger);
}

.delete-btn:hover:not(:disabled) {
  background: var(--danger-bg);
}

.save-btn:disabled,
.cancel-btn:disabled,
.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- ขวา --- */
.info-col {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: sticky;
  top: 1.25rem;
}

@media (max-width: 1100px) {
  .info-col {
    position: static;
  }
}

.info-card {
  padding: 1.2rem 1.3rem;
}

.info-title {
  font-weight: 600;
  margin-bottom: 0.8rem;
}

.info-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-size: 0.85rem;
}

.info-list div {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.info-list dt {
  color: var(--text-muted);
}

.info-list dd {
  margin: 0;
  text-align: right;
}

.source-box {
  margin-top: 1rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--border);
  font-size: 0.82rem;
}

.source-title {
  color: var(--text-muted);
  margin-bottom: 0.4rem;
}

.source-box ul {
  margin: 0;
  padding-left: 1.1rem;
  line-height: 1.6;
  word-break: break-word;
}

.tip-card p {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.65;
  color: var(--text-muted);
}
</style>
