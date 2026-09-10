<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../supabaseClient'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const router = useRouter()
const { user, authReady, signInWithGoogle } = useAuth()

const token = route.params.token

const isLoading = ref(true)
const loadError = ref('')
const preview = ref(null) // { type, content } | { type, title, total_questions, preview_questions } | { type, title, total_cards, preview_cards }

const mySubjects = ref([])
const isLoadingSubjects = ref(false)
const selectedSubjectId = ref('')

const isCloning = ref(false)
const cloneError = ref('')
const cloneResult = ref(null) // { type, id }

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

  if (!error) {
    mySubjects.value = data
    if (data.length > 0) selectedSubjectId.value = data[0].id
  }
  isLoadingSubjects.value = false
}

function goLoginThenBack() {
  // ใช้ Path ปัจจุบัน (รวม token) เป็น redirect กลับมาหลัง Login สำเร็จ
  signInWithGoogle(route.fullPath)
}

async function handleClone() {
  if (!selectedSubjectId.value) return
  isCloning.value = true
  cloneError.value = ''

  const { data, error } = await supabase.rpc('import_shared_content', {
    p_token: token,
    p_target_subject_id: selectedSubjectId.value
  })

  if (error) {
    cloneError.value = error.message || 'Clone ไม่สำเร็จ'
  } else {
    cloneResult.value = data
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
      <button class="primary-btn" @click="goToClonedSubject">ไปดูในวิชาที่เลือก</button>
    </div>

    <!-- Preview content -->
    <div v-else-if="preview" class="preview-card">
      <span class="badge">{{ typeLabel }} · ดูตัวอย่าง</span>

      <!-- Summary: เต็มรูปแบบ -->
      <div v-if="preview.type === 'summary'" class="summary-content">
        {{ preview.content }}
      </div>

      <!-- Quiz: 3 ข้อแรก เฉพาะคำถาม -->
      <div v-else-if="preview.type === 'quiz'">
        <h1 class="content-title">{{ preview.title }}</h1>
        <p class="meta-text">ทั้งหมด {{ preview.total_questions }} ข้อ — แสดงตัวอย่าง {{ preview.preview_questions.length }} ข้อแรก</p>
        <ol class="preview-list">
          <li v-for="(q, i) in preview.preview_questions" :key="i">{{ q }}</li>
        </ol>
        <p class="lock-note">🔒 ตัวเลือกคำตอบและเฉลยจะเปิดให้ดูหลัง Clone เข้าบัญชีของคุณเท่านั้น</p>
      </div>

      <!-- Flashcard set: 3 ใบแรก หน้าเดียว -->
      <div v-else-if="preview.type === 'flashcard_set'">
        <h1 class="content-title">{{ preview.title }}</h1>
        <p class="meta-text">ทั้งหมด {{ preview.total_cards }} ใบ — แสดงตัวอย่าง {{ preview.preview_cards.length }} ใบแรก</p>
        <div class="flashcard-grid">
          <div v-for="(card, i) in preview.preview_cards" :key="i" class="flashcard-face">
            {{ card }}
          </div>
        </div>
        <p class="lock-note">🔒 พลิกดูคำตอบได้หลัง Clone เข้าบัญชีของคุณเท่านั้น</p>
      </div>

      <!-- Clone action area -->
      <div class="clone-area">
        <!-- ยังไม่ login -->
        <div v-if="authReady && !user">
          <p class="clone-hint">ต้องเข้าสู่ระบบก่อนถึง Clone เข้าบัญชีของคุณได้</p>
          <button class="primary-btn" @click="goLoginThenBack">เข้าสู่ระบบด้วย Google</button>
        </div>

        <!-- login แล้ว แต่ยังไม่มีวิชา -->
        <div v-else-if="authReady && user && !isLoadingSubjects && mySubjects.length === 0">
          <p class="clone-hint">คุณยังไม่มีวิชาเลย ต้องสร้างวิชาก่อนถึง Clone ได้</p>
          <router-link class="primary-btn" to="/subjects">ไปสร้างวิชา</router-link>
        </div>

        <!-- login แล้ว มีวิชาให้เลือก -->
        <div v-else-if="authReady && user && mySubjects.length > 0">
          <label class="clone-hint" for="subject-select">เลือกวิชาปลายทางของคุณ</label>
          <select id="subject-select" v-model="selectedSubjectId" class="subject-select">
            <option v-for="s in mySubjects" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <button class="primary-btn" :disabled="isCloning || !selectedSubjectId" @click="handleClone">
            {{ isCloning ? 'กำลัง Clone...' : 'Clone เข้าวิชานี้' }}
          </button>
          <p v-if="cloneError" class="error-detail">{{ cloneError }}</p>
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
  color: #8a6d1a;
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
  white-space: pre-wrap;
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
  color: #8a6d1a;
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

.subject-select {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  font-size: 0.9rem;
  font-family: var(--font-body);
  margin-bottom: 0.75rem;
}

.primary-btn {
  display: inline-block;
  padding: 0.65rem 1.1rem;
  border-radius: 8px;
  border: none;
  background: var(--indigo);
  color: #ffffff;
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
</style>