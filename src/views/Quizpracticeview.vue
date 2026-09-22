<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../supabaseClient'
import { useAuth } from '../composables/useAuth'

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

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    <p v-if="isLoading" class="status-text">กำลังโหลด...</p>

    <template v-else-if="quiz">
      <header class="page-header">
        <h1>{{ quiz.title }}</h1>
        <p class="progress-label" v-if="!result">
          ตอบแล้ว {{ answeredCount }}/{{ questions.length }} ข้อ
        </p>
      </header>

      <div v-if="result" class="result-banner">
        <p class="result-score">ได้ {{ result.score }} / {{ result.total }} คะแนน</p>
        <p class="result-hint">เฉลยของแต่ละข้อแสดงอยู่ด้านล่างแล้ว — สีเขียวคือคำตอบที่ถูก</p>
      </div>

      <ol class="question-list">
        <li v-for="(q, idx) in questions" :key="q.question_id" class="question-block">
          <p class="question-text">{{ idx + 1 }}. {{ q.question_text }}</p>

          <ul class="choice-list">
            <li v-for="c in q.choices" :key="c.choice_id">
              <button
                type="button"
                class="choice-btn"
                :class="choiceStateClass(q, c)"
                :disabled="!!result"
                @click="selectAnswer(q.question_id, c.choice_id)"
              >
                <span class="choice-radio" :class="{ checked: isSelected(q.question_id, c.choice_id) }"></span>
                {{ c.choice_text }}
                <span v-if="result && c.is_correct" class="correct-badge">✓ คำตอบที่ถูก</span>
              </button>
            </li>
          </ul>

          <p v-if="result && q.explanation" class="explanation-text">{{ q.explanation }}</p>
        </li>
      </ol>

      <div class="submit-bar" v-if="!result">
        <p v-if="submitError" class="error-text">{{ submitError }}</p>
        <button class="submit-btn" :disabled="isSubmitting" @click="handleSubmit">
          {{ isSubmitting ? 'กำลังส่งคำตอบ...' : 'ส่งคำตอบ' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
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
  font-size: 1.35rem;
  margin: 0 0 0.3rem;
}

.progress-label {
  font-size: 0.85rem;
  color: var(--ink-faint);
  margin: 0;
}

.status-text {
  color: var(--ink-soft);
  font-size: 0.9rem;
}

.error-text {
  color: #d64545;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.result-banner {
  padding: 1rem 1.1rem;
  border-radius: 10px;
  background: #eef7ee;
  border: 1px solid #bfe3bf;
  margin-bottom: 1.5rem;
}

.result-score {
  font-size: 1.2rem;
  font-weight: 700;
  margin: 0 0 0.25rem;
  color: #1e7b34;
}

.result-hint {
  font-size: 0.82rem;
  color: var(--ink-soft);
  margin: 0;
}

.question-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.question-block {
  border-bottom: 1px solid var(--border);
  padding-bottom: 1.25rem;
}

.question-text {
  font-size: 0.98rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
}

.choice-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.choice-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  text-align: left;
  padding: 0.65rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--card);
  font-size: 0.9rem;
  cursor: pointer;
  color: var(--ink);
}

.choice-btn:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.choice-btn:disabled {
  cursor: default;
}

.choice-radio {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  box-sizing: border-box;
}

.choice-radio.checked {
  border-color: var(--indigo);
  background: var(--indigo);
  box-shadow: inset 0 0 0 3px #ffffff;
}

.choice-selected {
  border-color: var(--indigo);
  background: #eef0ff;
}

.choice-correct {
  border-color: #7fc98f;
  background: #eef7ee;
}

.choice-wrong {
  border-color: #e2a1a1;
  background: #fbeaea;
}

.correct-badge {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 700;
  color: #1e7b34;
  white-space: nowrap;
}

.explanation-text {
  margin: 0.7rem 0 0;
  padding: 0.65rem 0.8rem;
  background: var(--highlighter-soft);
  border: 1px solid var(--highlighter);
  border-radius: 8px;
  font-size: 0.85rem;
  color: var(--ink-soft);
  line-height: 1.6;
}

.submit-bar {
  margin-top: 1.5rem;
}

.submit-btn {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: none;
  background: var(--indigo);
  color: #ffffff;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.submit-btn:hover:not(:disabled) {
  background: var(--indigo-dark);
}

.submit-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>