<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../supabaseClient'
import { useAuth } from '../composables/useAuth'
import { toast } from '../composables/useDialog'
import MarkdownContent from '../component/MarkdownContent.vue'
import AppSelect from '../component/AppSelect.vue'

const route = useRoute()
const router = useRouter()
const { user, authReady, signInWithGoogle } = useAuth()

const token = route.params.token

const isLoading = ref(true)
const loadError = ref('')
const preview = ref(null) // { type, content } | { type, title, total_questions, preview_questions } | { type, title, total_cards, preview_cards }

const mySubjects = ref([])
const isLoadingSubjects = ref(false)
const subjectsLoaded = ref(false)
const NEW_SUBJECT = '__new__' // ค่าพิเศษในตัวเลือก = ผู้ใช้ต้องการสร้างวิชาใหม่
const selectedSubjectId = ref('')
const newSubjectName = ref('')

// ตัวเลือกใน Dropdown: วิชาของผู้ใช้ + ตัวเลือกพิเศษ "สร้างวิชาใหม่" ท้ายรายการ
const subjectOptions = computed(() => [
  ...mySubjects.value.map((s) => ({ value: s.id, label: s.name })),
  { value: NEW_SUBJECT, label: 'สร้างวิชาใหม่...', action: true }
])

const isNewSubject = computed(() => selectedSubjectId.value === NEW_SUBJECT)
const canClone = computed(() =>
  isNewSubject.value ? newSubjectName.value.trim().length > 0 : !!selectedSubjectId.value
)

const isCloning = ref(false)
const cloneError = ref('')
const cloneResult = ref(null) // { type, id }
const fileResult = ref(null) // ผลคัดลอกไฟล์ต้นทาง { copied, skipped, failed } | null
const fileCopyError = ref('')
const isCopyingFiles = ref(false) // กำลังคัดลอกไฟล์ต้นทางอยู่ — ห้ามเข้าหน้าวิชาก่อน ไม่งั้นรายการไฟล์จะยังว่าง

const sourceFiles = computed(() => preview.value?.source_files || [])

const typeLabel = computed(() => {
  if (!preview.value) return ''
  return { summary: 'สรุปเนื้อหา', quiz: 'แบบทดสอบ', flashcard_set: 'ชุดบัตรคำ' }[preview.value.type] || ''
})

async function loadPreview() {
  isLoading.value = true
  loadError.value = ''
  const { data, error } = await supabase.rpc('get_shared_preview', { p_token: token })

  if (error) {
    // ข้อความจาก RAISE EXCEPTION ในฟังก์ชันจะมาที่ error.message ตรงๆ
    loadError.value = error.message || 'ไม่สามารถโหลด Preview ได้'
  } else {
    preview.value = data
  }
  isLoading.value = false
}

async function loadMySubjects() {
  if (!user.value) return
  isLoadingSubjects.value = true
  const { data, error } = await supabase
    .from('subjects')
    .select('id, name')
    .order('created_at', { ascending: false })

  if (!error) mySubjects.value = data
  // ถ้ายังไม่มีวิชาเลย ให้เข้าโหมดสร้างวิชาใหม่ทันที
  // มาจากช่องวางลิงก์ในหน้าวิชา (?subject=<id>) -> เลือกวิชานั้นให้ ถ้ายังอยู่ในรายการของผู้ใช้
  const preferred = route.query.subject
  const hasPreferred = mySubjects.value.some((s) => s.id === preferred)
  selectedSubjectId.value = hasPreferred
    ? preferred
    : mySubjects.value.length > 0
      ? mySubjects.value[0].id
      : NEW_SUBJECT
  isLoadingSubjects.value = false
  subjectsLoaded.value = true
}

function goLoginThenBack() {
  // ใช้ Path ปัจจุบัน (รวม token) เป็น redirect กลับมาหลัง Login สำเร็จ
  signInWithGoogle(route.fullPath)
}

async function handleClone() {
  if (!canClone.value) return
  isCloning.value = true
  cloneError.value = ''

  // เลือก "สร้างวิชาใหม่" -> สร้างวิชาก่อน แล้วค่อย Clone เข้าวิชานั้น
  if (isNewSubject.value) {
    const { data: created, error: createErr } = await supabase
      .from('subjects')
      .insert({ name: newSubjectName.value.trim(), user_id: user.value.id })
      .select('id, name')
      .single()

    if (createErr) {
      toast.error('สร้างวิชาไม่สำเร็จ: ' + createErr.message)
      isCloning.value = false
      return
    }
    // เปลี่ยนตัวเลือกไปที่วิชาที่เพิ่งสร้าง — ถ้า Clone พลาดแล้วกดซ้ำ จะไม่สร้างวิชาซ้ำ
    mySubjects.value.unshift(created)
    selectedSubjectId.value = created.id
    newSubjectName.value = ''
  }

  const { data, error } = await supabase.rpc('import_shared_content', {
    p_token: token,
    p_target_subject_id: selectedSubjectId.value
  })

  if (error) {
    toast.error(error.message || 'Clone ไม่สำเร็จ', { title: 'Clone ไม่สำเร็จ' })
  } else {
    cloneResult.value = data
    toast.success('Clone เนื้อหาเข้าวิชาของคุณแล้ว')

    // เจ้าของเลือกแนบไฟล์ต้นทาง -> ให้เซิร์ฟเวอร์คัดลอกไฟล์ลงบัญชีผู้รับ (เนื้อหา Clone สำเร็จแล้ว ไม่ย้อนกลับถ้าขั้นนี้พลาด)
    if (preview.value?.include_source_files && sourceFiles.value.length > 0) {
      isCopyingFiles.value = true
      const { data: fileData, error: fileErr } = await supabase.functions.invoke('copy-shared-files', {
        body: { share_token: token, new_content_id: data.id }
      })
      isCopyingFiles.value = false
      if (fileErr) {
        fileCopyError.value = 'Clone เนื้อหาสำเร็จ แต่คัดลอกไฟล์ต้นทางไม่สำเร็จ ลองอัปโหลดไฟล์เองได้ภายหลัง'
      } else {
        fileResult.value = fileData
      }
    }
  }
  isCloning.value = false
}

function goToClonedSubject() {
  if (cloneResult.value) {
    router.push(`/subjects/${selectedSubjectId.value}`)
  }
}

onMounted(async () => {
  await loadPreview()
  // รอเช็ค session ให้เสร็จก่อน ค่อยตัดสินใจโหลดรายวิชา (กันกรณี refresh หน้านี้)
  if (!authReady.value) {
    const stop = setInterval(() => {
      if (authReady.value) {
        clearInterval(stop)
        if (user.value) loadMySubjects()
      }
    }, 20)
  } else if (user.value) {
    loadMySubjects()
  }
})
</script>

<template>
  <div class="page">
    <!-- Loading -->
    <div v-if="isLoading" class="status-text">กำลังโหลด Preview...</div>

    <!-- Invalid / inactive link -->
    <div v-else-if="loadError" class="error-box">
      <p class="error-title">เปิดลิงก์นี้ไม่ได้</p>
      <p class="error-detail">{{ loadError }}</p>
    </div>

    <!-- Cloned successfully -->
    <div v-else-if="cloneResult" class="success-box">
      <p class="success-title">Clone สำเร็จแล้ว 🎉</p>
      <p class="success-detail">
        เพิ่ม{{ typeLabel }}เข้าวิชาที่เลือกเรียบร้อย เป็นสำเนาของคุณเองแล้ว แก้ไข/ลบต้นฉบับภายหลังจะไม่กระทบสำเนานี้
      </p>
      <p v-if="isCopyingFiles" class="success-detail">⏳ กำลังคัดลอกไฟล์ต้นทาง กรุณารอสักครู่ แล้วค่อยกดไปดูในวิชา...</p>
      <p v-if="fileResult && fileResult.copied > 0" class="success-detail">
        คัดลอกไฟล์ต้นทางให้แล้ว {{ fileResult.copied }} ไฟล์
      </p>
      <p v-if="fileResult && (fileResult.skipped.length || fileResult.failed.length)" class="success-detail">
        คัดลอกไม่ได้: {{ [...fileResult.skipped, ...fileResult.failed].join(', ') }}
        (ไฟล์ต้นทางอาจถูกลบไปแล้ว)
      </p>
      <p v-if="fileCopyError" class="success-detail">{{ fileCopyError }}</p>
      <button class="primary-btn" :disabled="isCopyingFiles" @click="goToClonedSubject">
        {{ isCopyingFiles ? 'กำลังคัดลอกไฟล์...' : 'ไปดูในวิชาที่เลือก' }}
      </button>
    </div>

    <!-- Preview content -->
    <div v-else-if="preview" class="preview-card">
      <span class="badge">{{ typeLabel }} · ดูตัวอย่าง</span>

      <!-- Summary: เต็มรูปแบบ -->
      <MarkdownContent v-if="preview.type === 'summary'" class="summary-content" :source="preview.content" />

      <!-- Quiz: 3 ข้อแรก เฉพาะคำถาม -->
      <div v-else-if="preview.type === 'quiz'">
        <h1 class="content-title">{{ preview.title }}</h1>
        <p class="meta-text">ทั้งหมด {{ preview.total_questions }} ข้อ — แสดงตัวอย่าง {{ preview.preview_questions.length }} ข้อแรก</p>
        <ol class="preview-list">
          <li v-for="(q, i) in preview.preview_questions" :key="i"><MarkdownContent inline :source="q" /></li>
        </ol>
        <p class="lock-note">🔒 ตัวเลือกคำตอบและเฉลยจะเปิดให้ดูหลัง Clone เข้าบัญชีของคุณเท่านั้น</p>
      </div>

      <!-- Flashcard set: 3 ใบแรก หน้าเดียว -->
      <div v-else-if="preview.type === 'flashcard_set'">
        <h1 class="content-title">{{ preview.title }}</h1>
        <p class="meta-text">ทั้งหมด {{ preview.total_cards }} ใบ — แสดงตัวอย่าง {{ preview.preview_cards.length }} ใบแรก</p>
        <div class="flashcard-grid">
          <div v-for="(card, i) in preview.preview_cards" :key="i" class="flashcard-face">
            <MarkdownContent inline :source="card" />
          </div>
        </div>
        <p class="lock-note">🔒 พลิกดูคำตอบได้หลัง Clone เข้าบัญชีของคุณเท่านั้น</p>
      </div>

      <!-- ไฟล์ต้นทางที่เจ้าของแนบมา (แสดงเฉพาะชื่อ จะได้ไฟล์หลัง Clone) -->
      <div v-if="sourceFiles.length > 0" class="attach-box">
        <p class="attach-title">📎 มีไฟล์ต้นทางแนบมาด้วย {{ sourceFiles.length }} ไฟล์</p>
        <ul class="attach-list">
          <li v-for="(f, i) in sourceFiles" :key="i">{{ f }}</li>
        </ul>
        <p class="attach-note">เมื่อกด Clone ไฟล์เหล่านี้จะถูกคัดลอกเข้าวิชาของคุณเป็นสำเนาของคุณเอง</p>
      </div>

      <!-- Clone action area -->
      <div class="clone-area">
        <!-- ยังไม่ login -->
        <div v-if="authReady && !user">
          <p class="clone-hint">ต้องเข้าสู่ระบบก่อนถึง Clone เข้าบัญชีของคุณได้</p>
          <button class="primary-btn" @click="goLoginThenBack">เข้าสู่ระบบด้วย Google</button>
        </div>

        <!-- login แล้ว โหลดรายวิชาเสร็จ: เลือกวิชาเดิม หรือสร้างวิชาใหม่ได้เลย -->
        <div v-else-if="authReady && user && subjectsLoaded">
          <label class="clone-hint" for="subject-select">เลือกวิชาปลายทางของคุณ</label>
          <AppSelect id="subject-select" v-model="selectedSubjectId" :options="subjectOptions" class="subject-field" />
          <input
            v-if="isNewSubject"
            v-model="newSubjectName"
            type="text"
            class="subject-select"
            placeholder="ตั้งชื่อวิชาใหม่"
            aria-label="ชื่อวิชาใหม่"
            @keyup.enter="handleClone"
          />
          <button class="primary-btn" :disabled="isCloning || !canClone" @click="handleClone">
            {{ isCloning ? 'กำลัง Clone...' : isNewSubject ? 'สร้างวิชาและ Clone' : 'Clone เข้าวิชานี้' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.status-text {
  color: var(--ink-soft);
  font-size: 0.9rem;
  text-align: center;
  padding: 3rem 0;
}

.error-box, .success-box {
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
}

.error-box {
  background: var(--danger-bg);
}

.error-title {
  color: var(--danger);
  font-weight: 700;
  margin: 0 0 0.5rem;
  font-family: var(--font-heading);
}

.error-detail {
  color: var(--ink-soft);
  font-size: 0.85rem;
  margin: 0;
}

.success-box {
  background: var(--success-bg);
}

.success-title {
  color: var(--success);
  font-weight: 700;
  margin: 0 0 0.5rem;
  font-family: var(--font-heading);
}

.success-detail {
  color: var(--ink);
  font-size: 0.9rem;
  margin: 0 0 1rem;
  line-height: 1.5;
}

.preview-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1.5rem;
  background: var(--card);
}

.badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--warning);
  background: var(--highlighter-soft);
  border: 1px solid var(--highlighter);
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}

.content-title {
  font-size: 1.25rem;
  margin: 0 0 0.25rem;
}

.meta-text {
  font-size: 0.85rem;
  color: var(--ink-soft);
  margin: 0 0 1rem;
}

.summary-content {
  line-height: 1.75;
  font-size: 0.95rem;
}

.preview-list {
  padding-left: 1.2rem;
  line-height: 1.8;
  font-size: 0.95rem;
}

.flashcard-grid {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.flashcard-face {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  font-size: 0.95rem;
}

.lock-note {
  margin-top: 1rem;
  font-size: 0.8rem;
  color: var(--warning);
  background: var(--highlighter-soft);
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
}

.clone-area {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
}

.clone-hint {
  display: block;
  font-size: 0.85rem;
  color: var(--ink);
  margin-bottom: 0.5rem;
}

.subject-field {
  margin-bottom: 0.75rem;
}

.subject-select {
  width: 100%;
  padding: 0.7rem 0.9rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 0.95rem;
  font-family: var(--font-body);
  margin-bottom: 0.75rem;
}

.subject-select::placeholder {
  color: var(--text-muted);
}

.subject-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent);
}

.primary-btn {
  display: inline-block;
  padding: 0.65rem 1.1rem;
  border-radius: 8px;
  border: none;
  background: var(--indigo);
  color: var(--on-primary);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}

.primary-btn:hover:not(:disabled) {
  background: var(--indigo-dark);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.attach-box {
  margin: 1.25rem 0 0;
  padding: 0.9rem 1.1rem;
  background: var(--paper);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.attach-title {
  margin: 0 0 0.4rem;
  font-weight: 700;
  font-size: 0.9rem;
}

.attach-list {
  margin: 0 0 0.5rem;
  padding-left: 1.2rem;
  font-size: 0.85rem;
  word-break: break-all;
}

.attach-note {
  margin: 0;
  font-size: 0.8rem;
  color: var(--ink-soft);
}
</style>