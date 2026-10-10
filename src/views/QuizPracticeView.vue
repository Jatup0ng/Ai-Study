<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../supabaseClient'
import { useAuth } from '../composables/useAuth'
import MarkdownContent from '../component/MarkdownContent.vue'

const props = defineProps({
  quizId: { type: String, required: true }
})

const { user } = useAuth()

const quiz = ref(null) // { quiz_id, title, subject_id }
const questions = ref([]) // [{ question_id, question_text, explanation, choices: [{choice_id, choice_text, is_correct}] }]

const isLoading = ref(true)
const errorMessage = ref('')

// { [question_id]: choice_id } — คำตอบที่ผู้ใช้เลือกไว้ระหว่างทำข้อสอบ
const selectedAnswers = ref({})

const isSubmitting = ref(false)
const submitError = ref('')

// null ก่อนส่งคำตอบ, เป็น object หลังส่งแล้ว: { score, total, attemptId }
const result = ref(null)

async function fetchQuiz() {
  isLoading.value = true
  errorMessage.value = ''

  const { data: quizRow, error: quizErr } = await supabase
    .from('quizzes')
    .select('quiz_id, title, subject_id')
    .eq('quiz_id', props.quizId)
    .maybeSingle()

  if (quizErr) {
    errorMessage.value = 'โหลด Quiz ไม่สำเร็จ: ' + quizErr.message
    isLoading.value = false
    return
  }
  if (!quizRow) {
    errorMessage.value = 'ไม่พบ Quiz นี้ หรือคุณไม่มีสิทธิ์เข้าถึง'
    isLoading.value = false
    return
  }
  quiz.value = quizRow

  // ดึงคำถาม + ตัวเลือกทั้งหมด — จงใจไม่ Sort หรือ Mark คำตอบที่ถูกไว้ใน UI
  // เพื่อไม่ให้ผู้ใช้เห็นเฉลยก่อนส่งคำตอบ (ต่างจาก QuizDetailView ที่เป็นหน้าตรวจสอบ)
  const { data: questionRows, error: qErr } = await supabase
    .from('questions')
    .select('question_id, question_text, explanation')
    .eq('quiz_id', props.quizId)
    .order('question_id', { ascending: true })

  if (qErr || !questionRows) {
    errorMessage.value = 'โหลดคำถามไม่สำเร็จ: ' + (qErr?.message || '')
    isLoading.value = false
    return
  }

  const questionIds = questionRows.map((q) => q.question_id)
  const { data: choiceRows } = await supabase
    .from('choices')
    .select('choice_id, question_id, choice_text, is_correct')
    .in('question_id', questionIds)

  const choicesByQuestion = {}
  for (const c of choiceRows || []) {
    if (!choicesByQuestion[c.question_id]) choicesByQuestion[c.question_id] = []
    choicesByQuestion[c.question_id].push(c)
  }

  questions.value = questionRows.map((q) => ({
    ...q,
    choices: choicesByQuestion[q.question_id] || []
  }))

  isLoading.value = false
}

function selectAnswer(questionId, choiceId) {
  if (result.value) return // ส่งคำตอบไปแล้ว แก้ไม่ได้อีก
  selectedAnswers.value = { ...selectedAnswers.value, [questionId]: choiceId }
}

const answeredCount = computed(() => Object.keys(selectedAnswers.value).length)
const allAnswered = computed(() => answeredCount.value === questions.value.length)

async function handleSubmit() {
  if (!allAnswered.value) {
    submitError.value = `กรุณาตอบให้ครบทุกข้อก่อน (ตอบแล้ว ${answeredCount.value}/${questions.value.length} ข้อ)`
    return
  }

  isSubmitting.value = true
  submitError.value = ''

  try {
    // 1. สร้างแถว quiz_attempts ก่อน เพื่อเอา attempt_id มาผูกกับคำตอบแต่ละข้อ
    const { data: attempt, error: attemptErr } = await supabase
      .from('quiz_attempts')
      .insert({
        user_id: user.value.id,
        quiz_id: props.quizId,
        score: 0, // อัปเดตค่าจริงหลังคำนวณด้านล่าง
        completed_at: new Date().toISOString()
      })
      .select('attempt_id')
      .single()

    if (attemptErr) throw attemptErr

    // 2. คำนวณคะแนนฝั่ง Client จากข้อมูล is_correct ที่โหลดมาแล้ว
    let correctCount = 0
    const answerRows = questions.value.map((q) => {
      const selectedChoiceId = selectedAnswers.value[q.question_id]
      const selectedChoice = q.choices.find((c) => c.choice_id === selectedChoiceId)
      const isCorrect = !!selectedChoice?.is_correct
      if (isCorrect) correctCount++

      return {
        attempt_id: attempt.attempt_id,
        question_id: q.question_id,
        selected_choice_id: selectedChoiceId,
        is_correct: isCorrect
      }
    })

    const { error: answersErr } = await supabase.from('attempt_answers').insert(answerRows)
    if (answersErr) throw answersErr

    // 3. อัปเดตคะแนนจริงกลับเข้า quiz_attempts
    const { error: scoreErr } = await supabase
      .from('quiz_attempts')
      .update({ score: correctCount })
      .eq('attempt_id', attempt.attempt_id)

    if (scoreErr) throw scoreErr

    result.value = { score: correctCount, total: questions.value.length, attemptId: attempt.attempt_id }
  } catch (err) {
    submitError.value = 'ส่งคำตอบไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')
  } finally {
    isSubmitting.value = false
  }
}

function isSelected(questionId, choiceId) {
  return selectedAnswers.value[questionId] === choiceId
}

function choiceStateClass(question, choice) {
  if (!result.value) {
    // ก่อนส่งคำตอบ: ไฮไลต์แค่ตัวที่เลือกไว้ ไม่บอกเฉลย
    return isSelected(question.question_id, choice.choice_id) ? 'choice-selected' : ''
  }
  // หลังส่งคำตอบแล้ว: โชว์เฉลยเหมือน QuizDetailView
  if (choice.is_correct) return 'choice-correct'
  if (isSelected(question.question_id, choice.choice_id) && !choice.is_correct) return 'choice-wrong'
  return ''
}

// --- ทีละข้อ + ตารางเลขข้อ ---
const currentIndex = ref(0)
const currentQuestion = computed(() => questions.value[currentIndex.value] || null)
const isLast = computed(() => currentIndex.value >= questions.value.length - 1)
const choiceLabels = ['A', 'B', 'C', 'D', 'E', 'F']

function goTo(i) {
  if (i < 0 || i >= questions.value.length) return
  currentIndex.value = i
}

function isAnswered(q) {
  return selectedAnswers.value[q.question_id] !== undefined
}

function isQuestionCorrect(q) {
  const picked = q.choices.find((c) => c.choice_id === selectedAnswers.value[q.question_id])
  return !!picked?.is_correct
}

// สถานะของเลขข้อในตาราง: ก่อนส่ง = ตอบแล้ว/ยังไม่ตอบ, หลังส่ง = ถูก/ผิด
function navClass(q, i) {
  const classes = []
  if (i === currentIndex.value) classes.push('is-current')
  if (result.value) classes.push(isQuestionCorrect(q) ? 'is-correct' : 'is-wrong')
  else if (isAnswered(q)) classes.push('is-answered')
  return classes
}

const percent = computed(() =>
  result.value && result.value.total ? Math.round((result.value.score / result.value.total) * 100) : 0
)

function retry() {
  selectedAnswers.value = {}
  result.value = null
  submitError.value = ''
  currentIndex.value = 0
}

onMounted(fetchQuiz)
</script>

<template>
  <div class="page">
    <RouterLink
      v-if="quiz"
      :to="{ name: 'subject-workspace', params: { id: quiz.subject_id } }"
      class="back-link"
    >
      ← กลับไปหน้าวิชา
    </RouterLink>

    <p v-if="errorMessage" class="error-text" role="alert">{{ errorMessage }}</p>
    <p v-if="isLoading" class="status-text">กำลังโหลด...</p>

    <template v-else-if="quiz">
      <header class="page-header">
        <h1>{{ quiz.title }}</h1>
        <div class="progress-row">
          <span>ข้อ {{ currentIndex + 1 }} จาก {{ questions.length }}</span>
          <span v-if="!result">ตอบแล้ว {{ answeredCount }}/{{ questions.length }} ข้อ</span>
          <span v-else>ได้ {{ result.score }}/{{ result.total }} คะแนน</span>
        </div>
        <div class="progress-track" aria-hidden="true">
          <div
            class="progress-fill"
            :style="{ width: (questions.length ? ((currentIndex + 1) / questions.length) * 100 : 0) + '%' }"
          ></div>
        </div>
      </header>

      <p v-if="questions.length === 0" class="status-text">Quiz นี้ยังไม่มีคำถาม</p>

      <div v-else class="layout">
        <section v-if="currentQuestion" class="question-card">
          <span class="chip">ข้อ {{ currentIndex + 1 }}</span>
          <div class="question-text"><MarkdownContent inline :source="currentQuestion.question_text" /></div>

          <ul class="choice-list">
            <li v-for="(c, ci) in currentQuestion.choices" :key="c.choice_id">
              <button
                type="button"
                class="choice-btn"
                :class="choiceStateClass(currentQuestion, c)"
                :disabled="!!result"
                :aria-pressed="isSelected(currentQuestion.question_id, c.choice_id)"
                @click="selectAnswer(currentQuestion.question_id, c.choice_id)"
              >
                <span class="choice-letter">{{ choiceLabels[ci] }}</span>
                <span class="choice-body"><MarkdownContent inline :source="c.choice_text" /></span>
                <span v-if="result && c.is_correct" class="choice-tag">✓ คำตอบที่ถูก</span>
                <span
                  v-else-if="result && isSelected(currentQuestion.question_id, c.choice_id)"
                  class="choice-tag"
                >
                  คำตอบของคุณ
                </span>
              </button>
            </li>
          </ul>

          <div v-if="result && currentQuestion.explanation" class="explanation">
            <b>เฉลย</b>
            <div><MarkdownContent inline :source="currentQuestion.explanation" /></div>
          </div>

          <p v-if="submitError" class="error-text" role="alert">{{ submitError }}</p>

          <div class="step-row">
            <button type="button" class="ghost-btn" :disabled="currentIndex === 0" @click="goTo(currentIndex - 1)">
              ← ข้อก่อนหน้า
            </button>
            <button
              v-if="!isLast"
              type="button"
              class="primary-btn"
              @click="goTo(currentIndex + 1)"
            >
              ข้อถัดไป →
            </button>
            <button
              v-else-if="!result"
              type="button"
              class="primary-btn"
              :disabled="isSubmitting"
              @click="handleSubmit"
            >
              {{ isSubmitting ? 'กำลังส่งคำตอบ...' : 'ส่งคำตอบ' }}
            </button>
          </div>
        </section>

        <aside class="side">
          <div v-if="result" class="side-card result-card">
            <div class="side-title">ผลคะแนน</div>
            <div class="score">{{ result.score }}<span>/{{ result.total }}</span></div>
            <div class="score-sub">{{ percent }}% · เลือกเลขข้อเพื่อดูเฉลยแต่ละข้อ</div>
            <div class="result-actions">
              <button type="button" class="primary-btn" @click="retry">ทำใหม่อีกครั้ง</button>
              <RouterLink :to="{ name: 'quiz-detail', params: { quizId } }" class="ghost-link">
                ตรวจสอบ/แก้ไข Quiz
              </RouterLink>
            </div>
          </div>

          <div class="side-card">
            <div class="side-title">ข้อทั้งหมด</div>
            <div class="nav-grid">
              <button
                v-for="(q, i) in questions"
                :key="q.question_id"
                type="button"
                class="nav-cell"
                :class="navClass(q, i)"
                :aria-label="'ไปข้อ ' + (i + 1)"
                @click="goTo(i)"
              >
                {{ i + 1 }}
              </button>
            </div>
            <ul v-if="!result" class="legend">
              <li><span class="dot dot-answered"></span>ตอบแล้ว</li>
              <li><span class="dot"></span>ยังไม่ตอบ</li>
            </ul>
            <ul v-else class="legend">
              <li><span class="dot dot-correct"></span>ถูก</li>
              <li><span class="dot dot-wrong"></span>ผิด</li>
            </ul>
          </div>

          <div v-if="!result" class="side-card">
            <div class="side-title">พร้อมส่งหรือยัง</div>
            <p class="side-text">
              ตอบแล้ว {{ answeredCount }} จาก {{ questions.length }} ข้อ — ต้องตอบให้ครบทุกข้อก่อนส่ง
              เฉลยจะแสดงหลังส่งคำตอบ
            </p>
            <button type="button" class="primary-btn block" :disabled="isSubmitting" @click="handleSubmit">
              {{ isSubmitting ? 'กำลังส่งคำตอบ...' : 'ส่งคำตอบ' }}
            </button>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: 1200px;
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
  margin-bottom: 1.5rem;
}

.page-header h1 {
  font-size: 1.7rem;
  margin: 0 0 1rem;
}

.progress-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}

.progress-track {
  height: 8px;
  border-radius: 4px;
  background: var(--border);
}

.progress-fill {
  height: 8px;
  border-radius: 4px;
  background: var(--primary);
  transition: width 0.2s ease;
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
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 1.5rem;
  align-items: start;
}

@media (max-width: 1000px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .page {
    padding: 1.25rem 1rem 3rem;
  }
}

.question-card,
.side-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: var(--shadow-card);
}

.question-card {
  padding: 2rem 2.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.chip {
  align-self: flex-start;
  padding: 0.2rem 0.8rem;
  border-radius: 99px;
  background: var(--hover);
  color: var(--primary);
  font-size: 0.82rem;
  font-weight: 600;
}

.question-text {
  font-family: var(--font-serif);
  font-size: 1.4rem;
  line-height: 1.6;
}

.choice-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.choice-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.95rem 1.1rem;
  border-radius: 14px;
  border: 2px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 1rem;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.choice-btn:hover:not(:disabled) {
  border-color: var(--primary);
  background: var(--hover);
}

.choice-btn:disabled {
  cursor: default;
}

.choice-letter {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid currentColor;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.choice-body {
  flex: 1;
  min-width: 0;
}

.choice-tag {
  flex: none;
  font-size: 0.8rem;
  font-weight: 600;
}

.choice-selected {
  border-color: var(--primary);
  background: var(--hover);
}

.choice-selected .choice-letter {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}

.choice-correct {
  border-color: var(--success);
  background: var(--success-bg);
}

.choice-correct .choice-letter,
.choice-correct .choice-tag {
  color: var(--success);
}

.choice-wrong {
  border-color: var(--danger);
  background: var(--danger-bg);
}

.choice-wrong .choice-letter,
.choice-wrong .choice-tag {
  color: var(--danger);
}

.explanation {
  background: var(--info-bg);
  color: var(--info);
  border-radius: 14px;
  padding: 1rem 1.2rem;
  font-size: 0.95rem;
  line-height: 1.7;
}

.step-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.4rem;
}

.primary-btn,
.ghost-btn {
  padding: 0.65rem 1.3rem;
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

.primary-btn:hover:not(:disabled) {
  background: var(--primary-strong);
}

.primary-btn.block {
  width: 100%;
}

.ghost-btn {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}

.ghost-btn:hover:not(:disabled) {
  background: var(--hover);
}

.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* --- แผงขวา --- */
.side {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: sticky;
  top: 1.25rem;
}

@media (max-width: 1000px) {
  .side {
    position: static;
  }
}

.side-card {
  padding: 1.2rem 1.3rem;
}

.side-title {
  font-size: 1.02rem;
  font-weight: 600;
  margin-bottom: 0.8rem;
}

.side-text {
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--text-muted);
  margin: 0 0 0.9rem;
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem;
}

.nav-cell {
  height: 42px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
}

.nav-cell.is-answered {
  background: var(--hover);
  color: var(--primary);
  border-color: var(--primary);
}

.nav-cell.is-correct {
  background: var(--success-bg);
  color: var(--success);
  border-color: var(--success);
}

.nav-cell.is-wrong {
  background: var(--danger-bg);
  color: var(--danger);
  border-color: var(--danger);
}

.nav-cell.is-current {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.legend {
  list-style: none;
  margin: 0.9rem 0 0;
  padding: 0;
  display: flex;
  gap: 1rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.legend li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--border);
}

.dot-answered {
  background: var(--primary);
  border-color: var(--primary);
}

.dot-correct {
  background: var(--success);
  border-color: var(--success);
}

.dot-wrong {
  background: var(--danger);
  border-color: var(--danger);
}

.score {
  font-family: var(--font-heading);
  font-size: 2.4rem;
  font-weight: 700;
  color: var(--primary);
  line-height: 1.1;
}

.score span {
  font-size: 1.1rem;
  color: var(--text-muted);
  font-weight: 400;
}

.score-sub {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0.4rem 0 1rem;
}

.result-actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.ghost-link {
  text-align: center;
  font-size: 0.85rem;
  color: var(--primary);
  text-decoration: none;
  padding: 0.4rem;
}

.ghost-link:hover {
  text-decoration: underline;
}
</style>
