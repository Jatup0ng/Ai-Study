<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../supabaseClient'

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
    questions.value = questions.value.filter((item) => item.question_id !== q.question_id)
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

onMounted(fetchQuiz)
</script>

<template>
  <div class="page">
    <RouterLink :to="backLink" class="back-link">← กลับไปหน้าวิชา</RouterLink>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    <p v-if="isLoading" class="status-text">กำลังโหลด...</p>

    <template v-else-if="quiz">
      <header class="page-header">
        <div class="header-main">
          <span class="ai-badge">AI ออกข้อสอบให้</span>

          <template v-if="isEditingTitle">
            <input v-model="editedTitle" type="text" class="title-input" />
            <div class="title-actions">
              <button class="save-btn" :disabled="isSavingTitle || !editedTitle.trim()" @click="saveTitle">
                {{ isSavingTitle ? 'กำลังบันทึก...' : 'บันทึก' }}
              </button>
              <button class="cancel-btn" :disabled="isSavingTitle" @click="isEditingTitle = false">ยกเลิก</button>
            </div>
          </template>
          <template v-else>
            <h1 @click="startEditTitle" title="คลิกเพื่อแก้ไขชื่อ">{{ quiz.title }}</h1>
          </template>

          <p v-if="sourceFileNames.length" class="source-label">
            สร้างจาก {{ sourceFileNames.length }} ไฟล์: {{ sourceFileNames.join(', ') }}
          </p>
          <p class="timestamp-label">
            {{ questions.length }} ข้อ · สร้างเมื่อ {{ formatDateTime(quiz.created_at) }}
          </p>
        </div>
      </header>

      <p class="review-hint">
        ตรวจสอบความถูกต้องของคำถาม/เฉลยก่อนนำไปใช้จริงหรือแชร์ให้เพื่อน — คลิก "แก้ไข" ที่ข้อที่ต้องการปรับได้เลย
      </p>

      <ul class="question-list">
        <li v-for="(q, i) in questions" :key="q.question_id" class="question-card">
          <template v-if="editingQuestionId === q.question_id">
            <p class="question-number">ข้อที่ {{ i + 1 }}</p>
            <textarea v-model="draftQuestionText" class="edit-textarea" rows="2"></textarea>

            <div class="choice-edit-list">
              <div v-for="(c, ci) in draftChoices" :key="c.choice_id" class="choice-edit-row">
                <input
                  type="radio"
                  :name="'correct-' + q.question_id"
                  :checked="c.is_correct"
                  @change="setCorrectChoice(c.choice_id)"
                />
                <span class="choice-label">{{ choiceLabels[ci] }}</span>
                <input v-model="c.choice_text" type="text" class="choice-input" />
              </div>
            </div>

            <label class="explanation-label">
              คำอธิบายเฉลย
              <textarea v-model="draftExplanation" class="edit-textarea" rows="2"></textarea>
            </label>

            <p v-if="saveQuestionError" class="error-text">{{ saveQuestionError }}</p>

            <div class="edit-actions">
              <button class="save-btn" :disabled="isSavingQuestion" @click="saveQuestion">
                {{ isSavingQuestion ? 'กำลังบันทึก...' : 'บันทึก' }}
              </button>
              <button class="cancel-btn" :disabled="isSavingQuestion" @click="cancelEditQuestion">ยกเลิก</button>
            </div>
          </template>

          <template v-else>
            <div class="question-header">
              <p class="question-number">ข้อที่ {{ i + 1 }}</p>
              <div class="question-actions">
                <button class="edit-btn" @click="startEditQuestion(q)">แก้ไข</button>
                <button
                  class="delete-btn"
                  :disabled="deletingQuestionId === q.question_id"
                  @click="handleDeleteQuestion(q)"
                >
                  {{ deletingQuestionId === q.question_id ? '...' : 'ลบ' }}
                </button>
              </div>
            </div>

            <p class="question-text">{{ q.question_text }}</p>

            <ul class="choice-list">
              <li
                v-for="(c, ci) in q.choices"
                :key="c.choice_id"
                class="choice-item"
                :class="{ 'is-correct': c.is_correct }"
              >
                <span class="choice-label">{{ choiceLabels[ci] }}</span>
                <span>{{ c.choice_text }}</span>
                <span v-if="c.is_correct" class="correct-tag">✓ คำตอบที่ถูก</span>
              </li>
            </ul>

            <p v-if="q.explanation" class="explanation-text">💡 {{ q.explanation }}</p>
          </template>
        </li>
      </ul>

      <p v-if="questions.length === 0" class="status-text">Quiz นี้ไม่มีคำถามเหลืออยู่แล้ว</p>
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: 760px;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
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
  margin-bottom: 0.5rem;
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

.header-main h1 {
  font-size: 1.5rem;
  margin: 0 0 0.4rem;
  cursor: pointer;
}

.header-main h1:hover {
  text-decoration: underline;
  text-decoration-style: dotted;
}

.title-input {
  display: block;
  width: 100%;
  font-size: 1.3rem;
  font-family: var(--font-heading);
  font-weight: 700;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  margin-bottom: 0.5rem;
}

.title-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
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

.review-hint {
  font-size: 0.82rem;
  color: var(--ink-soft);
  background: var(--paper);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  margin: 1.25rem 0;
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

.question-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.question-card {
  padding: 1.1rem 1.25rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.question-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.question-number {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--ink-faint);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin: 0 0 0.5rem;
}

.question-actions {
  display: flex;
  gap: 0.5rem;
}

.edit-btn {
  background: none;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 0.3rem 0.7rem;
  font-size: 0.78rem;
  cursor: pointer;
  color: var(--ink-soft);
}

.delete-btn {
  background: none;
  border: 1px solid #f0c4c4;
  color: var(--danger);
  border-radius: 6px;
  padding: 0.3rem 0.7rem;
  font-size: 0.78rem;
  cursor: pointer;
}

.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.question-text {
  font-size: 0.98rem;
  line-height: 1.6;
  margin: 0 0 0.9rem;
}

.choice-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.choice-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 0.9rem;
}

.choice-item.is-correct {
  border-color: var(--success);
  background: var(--success-bg);
}

.choice-label {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--paper);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--ink-soft);
}

.correct-tag {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--success);
  white-space: nowrap;
}

.explanation-text {
  font-size: 0.85rem;
  color: var(--ink-soft);
  background: var(--paper);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  margin: 0;
  line-height: 1.6;
}

/* --- แก้ไขคำถาม --- */
.edit-textarea {
  width: 100%;
  padding: 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  font-size: 0.9rem;
  line-height: 1.6;
  font-family: var(--font-body);
  resize: vertical;
  box-sizing: border-box;
  margin-bottom: 0.75rem;
}

.choice-edit-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.choice-edit-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.choice-edit-row input[type='radio'] {
  accent-color: var(--indigo);
  flex-shrink: 0;
}

.choice-input {
  flex: 1;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--border-strong);
  font-size: 0.88rem;
  font-family: var(--font-body);
}

.explanation-label {
  display: block;
  font-size: 0.8rem;
  color: var(--ink-soft);
  margin-bottom: 0.75rem;
}

.edit-actions {
  display: flex;
  gap: 0.6rem;
}

.save-btn {
  padding: 0.5rem 1.05rem;
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
  padding: 0.5rem 1.05rem;
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
</style>