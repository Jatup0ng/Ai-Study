<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabaseClient'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { user, signOut } = useAuth()

const subjects = ref([])
const isLoading = ref(true)
const errorMessage = ref('')

const newSubjectName = ref('')
const isCreating = ref(false)

// สีไอคอนต่อวิชา — เลือกจากชุดสีที่คัดมาแล้ว (ไม่ใช่สุ่มมั่ว) โดย Hash
// ชื่อวิชาให้ได้สีเดิมเสมอ ไม่ต้องเก็บลง DB เพิ่ม
const ICON_PALETTE = [
  { bg: '#EAE6FB', fg: '#4338CA' }, // indigo
  { bg: '#FFF3D6', fg: '#8A6D1A' }, // highlighter
  { bg: '#E1F3EA', fg: '#1E7A3D' }, // green
  { bg: '#FDE7EC', fg: '#B23A5B' }, // rose
  { bg: '#E3EEFB', fg: '#2A5C9A' }  // sky
]

function iconStyle(name) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % ICON_PALETTE.length
  const c = ICON_PALETTE[Math.abs(hash)]
  return { background: c.bg, color: c.fg }
}

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

  if (error) errorMessage.value = 'สร้างวิชาไม่สำเร็จ: ' + error.message
  else {
    subjects.value.unshift(data)
    newSubjectName.value = ''
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

  if (error) errorMessage.value = 'แก้ไขชื่อวิชาไม่สำเร็จ: ' + error.message
  else {
    const idx = subjects.value.findIndex((s) => s.id === subject.id)
    if (idx !== -1) subjects.value[idx] = data
    cancelEdit()
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

  let message = `ต้องการลบวิชา "${subject.name}" ใช่หรือไม่?`
  if (total > 0) {
    message +=
      `\n\n⚠️ คำเตือน: วิชานี้มีเนื้อหาอยู่ทั้งหมด ${total} รายการ\n` +
      `- เอกสาร: ${docCount}\n- Summary: ${sumCount}\n- Quiz: ${quizCount}\n- Flashcard Set: ${setCount}\n\n` +
      `เนื้อหาทั้งหมดนี้จะถูกลบถาวรไปพร้อมกับวิชา ไม่สามารถกู้คืนได้`
  }

  if (!confirm(message)) return

  deletingId.value = subject.id
  const { error } = await supabase.from('subjects').delete().eq('id', subject.id)

  if (error) errorMessage.value = 'ลบวิชาไม่สำเร็จ: ' + error.message
  else subjects.value = subjects.value.filter((s) => s.id !== subject.id)
  deletingId.value = null
}

async function handleSignOut() {
  await signOut()
  router.push({ name: 'login' })
}

onMounted(fetchSubjects)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h1>วิชาของฉัน</h1>
      <button class="signout-btn" @click="handleSignOut">ออกจากระบบ</button>
    </header>

    <form class="create-form" @submit.prevent="createSubject">
      <input
        v-model="newSubjectName"
        type="text"
        placeholder="ชื่อวิชาใหม่ เช่น แคลคูลัส 1"
        class="create-input"
      />
      <button type="submit" class="create-btn" :disabled="isCreating || !newSubjectName.trim()">
        {{ isCreating ? 'กำลังสร้าง...' : '+ เพิ่มวิชา' }}
      </button>
    </form>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    <p v-if="isLoading" class="status-text">กำลังโหลด...</p>
    <p v-else-if="subjects.length === 0" class="status-text">
      ยังไม่มีวิชา — เริ่มสร้างวิชาแรกของคุณด้านบนได้เลย
    </p>

    <div v-else class="subject-grid">
      <div v-for="subject in subjects" :key="subject.id" class="subject-card">
        <template v-if="editingId === subject.id">
          <input v-model="editingName" type="text" class="edit-input" />
          <div class="item-actions">
            <button class="save-btn" :disabled="isSavingEdit || !editingName.trim()" @click="saveEdit(subject)">
              {{ isSavingEdit ? 'กำลังบันทึก...' : 'บันทึก' }}
            </button>
            <button class="cancel-btn" @click="cancelEdit">ยกเลิก</button>
          </div>
        </template>
        <template v-else>
          <RouterLink :to="{ name: 'subject-workspace', params: { id: subject.id } }" class="card-link">
            <span class="subject-icon" :style="iconStyle(subject.name)">{{ subject.name.charAt(0) }}</span>
            <span class="subject-name">{{ subject.name }}</span>
          </RouterLink>
          <div class="item-actions">
            <button class="edit-btn" @click="startEdit(subject)">แก้ไข</button>
            <button class="delete-btn" :disabled="deletingId === subject.id" @click="handleDelete(subject)">
              {{ deletingId === subject.id ? 'กำลังลบ...' : 'ลบ' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 880px;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.page-header h1 {
  font-size: 1.6rem;
  margin: 0;
}

.signout-btn {
  background: none;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--ink-soft);
}

.create-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
}

.create-input {
  flex: 1;
  padding: 0.65rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  font-size: 0.95rem;
  font-family: var(--font-body);
}

.create-btn {
  padding: 0.65rem 1.1rem;
  border-radius: 8px;
  border: none;
  background: var(--indigo);
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.create-btn:hover:not(:disabled) {
  background: var(--indigo-dark);
}

.create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.subject-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.9rem;
}

.subject-card {
  padding: 1.1rem;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--card);
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.subject-card:hover {
  border-color: var(--border-strong);
  box-shadow: 0 4px 14px rgba(27, 29, 41, 0.07);
}

.card-link {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  color: inherit;
  text-decoration: none;
  margin-bottom: 0.75rem;
}

.subject-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.1rem;
}

.subject-name {
  font-size: 0.98rem;
  font-weight: 600;
  line-height: 1.4;
}

.item-actions {
  display: flex;
  gap: 0.5rem;
}

.edit-input {
  width: 100%;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--border-strong);
  font-size: 0.9rem;
  font-family: var(--font-body);
  margin-bottom: 0.6rem;
}

.edit-btn,
.save-btn,
.cancel-btn {
  background: none;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 0.35rem 0.7rem;
  font-size: 0.78rem;
  cursor: pointer;
  white-space: nowrap;
  color: var(--ink-soft);
}

.save-btn {
  background: var(--indigo);
  color: #ffffff;
  border-color: var(--indigo);
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.delete-btn {
  background: none;
  border: 1px solid #f0c4c4;
  color: var(--danger);
  border-radius: 6px;
  padding: 0.35rem 0.7rem;
  font-size: 0.78rem;
  cursor: pointer;
}

.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
