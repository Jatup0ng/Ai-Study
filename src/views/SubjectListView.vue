<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabaseClient'
import { useAuth } from '../composables/useAuth'
import { confirmDialog, toast } from '../composables/useDialog'

const { user } = useAuth()

const subjects = ref([])
const isLoading = ref(true)
const errorMessage = ref('')

const newSubjectName = ref('')
const isCreating = ref(false)

// สีประจำวิชา — เลือกจาก token --subj-1..6 โดย Hash ชื่อวิชา
// ได้สีเดิมเสมอโดยไม่ต้องเก็บลง DB และเปลี่ยนตามโหมด Light/Dark อัตโนมัติ
const SUBJECT_COLOR_COUNT = 6

function subjectStyle(name) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % SUBJECT_COLOR_COUNT
  return { '--c': `var(--subj-${Math.abs(hash) + 1})` }
}

// จำนวนเนื้อหาต่อวิชา (นับจริงจาก DB — ไม่มีข้อมูลสมมติ)
const counts = ref({})

async function fetchCounts() {
  const [sums, quizzes, sets] = await Promise.all([
    supabase.from('summaries').select('subject_id'),
    supabase.from('quizzes').select('subject_id'),
    supabase.from('flashcard_sets').select('subject_id')
  ])
  const tally = {}
  const add = (rows, key) => {
    for (const r of rows || []) {
      tally[r.subject_id] ||= { summaries: 0, quizzes: 0, sets: 0 }
      tally[r.subject_id][key]++
    }
  }
  add(sums.data, 'summaries')
  add(quizzes.data, 'quizzes')
  add(sets.data, 'sets')
  counts.value = tally
}

function countOf(subject, key) {
  return counts.value[subject.id]?.[key] || 0
}

const firstName = computed(() => {
  const meta = user.value?.user_metadata || {}
  const full = meta.full_name || meta.name || user.value?.email?.split('@')[0] || ''
  return full.split(' ')[0]
})

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'สวัสดีตอนเช้า'
  if (h < 17) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนเย็น'
})

async function fetchSubjects() {
  isLoading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('subjects')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })

  if (error) errorMessage.value = 'โหลดรายวิชาไม่สำเร็จ: ' + error.message
  else subjects.value = data
  isLoading.value = false
}

async function createSubject() {
  const name = newSubjectName.value.trim()
  if (!name) return

  isCreating.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('subjects')
    .insert({ name, user_id: user.value.id })
    .select('id, name, created_at')
    .single()

  if (error) toast.error('สร้างวิชาไม่สำเร็จ: ' + error.message)
  else {
    subjects.value.unshift(data)
    newSubjectName.value = ''
    toast.success(`เพิ่มวิชา "${data.name}" แล้ว`)
  }
  isCreating.value = false
}

const editingId = ref(null)
const editingName = ref('')
const isSavingEdit = ref(false)
const deletingId = ref(null)

function startEdit(subject) {
  editingId.value = subject.id
  editingName.value = subject.name
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ''
}

async function saveEdit(subject) {
  const name = editingName.value.trim()
  if (!name) return

  isSavingEdit.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('subjects')
    .update({ name })
    .eq('id', subject.id)
    .select('id, name, created_at')
    .single()

  if (error) toast.error('แก้ไขชื่อวิชาไม่สำเร็จ: ' + error.message)
  else {
    const idx = subjects.value.findIndex((s) => s.id === subject.id)
    if (idx !== -1) subjects.value[idx] = data
    cancelEdit()
    toast.success('บันทึกชื่อวิชาแล้ว')
  }
  isSavingEdit.value = false
}

async function handleDelete(subject) {
  errorMessage.value = ''

  const [docs, sums, quizzes, sets] = await Promise.all([
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('subject_id', subject.id),
    supabase.from('summaries').select('*', { count: 'exact', head: true }).eq('subject_id', subject.id),
    supabase.from('quizzes').select('*', { count: 'exact', head: true }).eq('subject_id', subject.id),
    supabase.from('flashcard_sets').select('*', { count: 'exact', head: true }).eq('subject_id', subject.id)
  ])

  const docCount = docs.count || 0
  const sumCount = sums.count || 0
  const quizCount = quizzes.count || 0
  const setCount = sets.count || 0
  const total = docCount + sumCount + quizCount + setCount

  const ok = await confirmDialog({
    tone: 'danger',
    title: `ลบวิชา "${subject.name}" ?`,
    message: total > 0 ? 'เนื้อหาทั้งหมดในวิชานี้จะถูกลบถาวรไปพร้อมกับวิชา' : 'วิชานี้ยังไม่มีเนื้อหา',
    items: total > 0
      ? [
          { label: 'เอกสาร', value: docCount },
          { label: 'สรุป', value: sumCount },
          { label: 'Quiz', value: quizCount },
          { label: 'Flashcard', value: setCount }
        ]
      : [],
    warnings: total > 0 ? [`ลบแล้วไม่สามารถกู้คืนได้ (รวม ${total} รายการ)`] : [],
    confirmText: 'ลบวิชา',
    cancelText: 'ยกเลิก'
  })
  if (!ok) return

  deletingId.value = subject.id
  const { error } = await supabase.from('subjects').delete().eq('id', subject.id)

  if (error) toast.error('ลบวิชาไม่สำเร็จ: ' + error.message)
  else {
    subjects.value = subjects.value.filter((s) => s.id !== subject.id)
    toast.success(`ลบวิชา "${subject.name}" แล้ว`)
  }
  deletingId.value = null
}

onMounted(() => {
  fetchSubjects()
  fetchCounts()
})
</script>

<template>
  <div class="page">
      <header class="page-header">
        <div>
          <h1>{{ greeting }}<template v-if="firstName">, {{ firstName }}</template></h1>
          <p class="sub">เลือกวิชาที่ต้องการอ่านหรือทบทวนต่อ</p>
        </div>
      </header>

      <section class="subjects-section" aria-labelledby="subjects-title">
        <div class="section-head">
          <h2 id="subjects-title">
            วิชาของฉัน
            <span v-if="!isLoading" class="count">· {{ subjects.length }} วิชา</span>
          </h2>
          <form class="create-form" @submit.prevent="createSubject">
            <input
              v-model="newSubjectName"
              type="text"
              placeholder="ชื่อวิชาใหม่ เช่น แคลคูลัส 1"
              class="create-input"
              aria-label="ชื่อวิชาใหม่"
            />
            <button type="submit" class="create-btn" :disabled="isCreating || !newSubjectName.trim()">
              {{ isCreating ? 'กำลังสร้าง...' : '+ เพิ่มวิชา' }}
            </button>
          </form>
        </div>

        <p v-if="errorMessage" class="error-text" role="alert">{{ errorMessage }}</p>
        <p v-if="isLoading" class="status-text">กำลังโหลด...</p>
        <div v-else-if="subjects.length === 0" class="empty">
          <p class="empty-title">ยังไม่มีวิชา</p>
          <p class="status-text">พิมพ์ชื่อวิชาแรกของคุณที่ช่องด้านบนแล้วกด “เพิ่มวิชา” ได้เลย</p>
        </div>

        <div v-else class="subject-grid">
          <article
            v-for="subject in subjects"
            :key="subject.id"
            class="subject-card"
            :style="subjectStyle(subject.name)"
          >
            <template v-if="editingId === subject.id">
              <input v-model="editingName" type="text" class="edit-input" aria-label="ชื่อวิชา" />
              <div class="item-actions">
                <button class="save-btn" :disabled="isSavingEdit || !editingName.trim()" @click="saveEdit(subject)">
                  {{ isSavingEdit ? 'กำลังบันทึก...' : 'บันทึก' }}
                </button>
                <button class="ghost-btn" @click="cancelEdit">ยกเลิก</button>
              </div>
            </template>
            <template v-else>
              <RouterLink :to="{ name: 'subject-workspace', params: { id: subject.id } }" class="card-link">
                <span class="subject-icon" aria-hidden="true">{{ subject.name.charAt(0) }}</span>
                <span class="subject-name">{{ subject.name }}</span>
                <span class="subject-meta">
                  {{ countOf(subject, 'summaries') }} สรุป ·
                  {{ countOf(subject, 'quizzes') }} Quiz ·
                  {{ countOf(subject, 'sets') }} บัตรคำ
                </span>
                <span class="open-hint">เปิดวิชา →</span>
              </RouterLink>
              <div class="item-actions">
                <button class="ghost-btn" @click="startEdit(subject)">แก้ไข</button>
                <button class="delete-btn" :disabled="deletingId === subject.id" @click="handleDelete(subject)">
                  {{ deletingId === subject.id ? 'กำลังลบ...' : 'ลบ' }}
                </button>
              </div>
            </template>
          </article>
        </div>
      </section>
  </div>
</template>

<style scoped>
.page {
  max-width: 1080px;
  margin: 0 auto;
  padding: 2.25rem 2.5rem 4rem;
}

.page-header h1 {
  font-size: 1.75rem;
  margin: 0 0 0.3rem;
}

.sub {
  margin: 0 0 2rem;
  color: var(--text-muted);
  font-size: 0.95rem;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.1rem;
}

.section-head h2 {
  margin: 0;
  font-size: 1.35rem;
}

.count {
  font-size: 0.95rem;
  font-weight: 400;
  color: var(--text-muted);
}

.create-form {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  max-width: 440px;
}

.create-input {
  flex: 1;
  min-width: 0;
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 0.92rem;
}

.create-btn {
  padding: 0.6rem 1.1rem;
  border-radius: 10px;
  border: none;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.create-btn:hover:not(:disabled) {
  background: var(--primary-strong);
}

.create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-text {
  color: var(--text-muted);
  font-size: 0.92rem;
}

.error-text {
  color: var(--danger);
  background: var(--danger-bg);
  border-radius: 10px;
  padding: 0.6rem 0.9rem;
  font-size: 0.88rem;
}

.empty {
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 18px;
  padding: 2.5rem 1.5rem;
  text-align: center;
}

.empty-title {
  margin: 0 0 0.3rem;
  font-weight: 600;
  font-size: 1.05rem;
}

.subject-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.25rem;
}

.subject-card {
  --c: var(--primary);
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1.35rem;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: var(--shadow-card);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.subject-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--c) 45%, var(--border));
  box-shadow: var(--shadow-lift);
}

.card-link {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  color: inherit;
  text-decoration: none;
}

.subject-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 0.4rem;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--c) 16%, transparent);
  color: var(--c);
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.25rem;
}

.subject-name {
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1.4;
}

.subject-meta {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.open-hint {
  margin-top: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--primary);
}

.item-actions {
  display: flex;
  gap: 0.5rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border);
}

.edit-input {
  width: 100%;
  padding: 0.5rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 0.92rem;
}

.ghost-btn,
.save-btn,
.delete-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.35rem 0.75rem;
  font-size: 0.78rem;
  cursor: pointer;
  white-space: nowrap;
  color: var(--text-muted);
}

.ghost-btn:hover {
  background: var(--hover);
}

.save-btn {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
  font-weight: 600;
}

.delete-btn {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
}

.delete-btn:hover:not(:disabled) {
  background: var(--danger-bg);
}

.save-btn:disabled,
.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 860px) {
  .page {
    padding: 1.5rem 1rem 3rem;
  }
}
</style>
