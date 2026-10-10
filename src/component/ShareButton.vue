<script setup>
import { ref, computed } from 'vue'
import { supabase } from '../supabaseClient'

// contentType ต้องตรงกับชื่อคอลัมน์ FK ใน shares table แบบสั้น
// 'summary' -> summary_id, 'quiz' -> quiz_id, 'flashcard_set' -> flashcard_set_id
const props = defineProps({
  contentType: { type: String, required: true },
  contentId: { type: [String, Number], required: true }
})

const columnMap = {
  summary: 'summary_id',
  quiz: 'quiz_id',
  flashcard_set: 'flashcard_set_id'
}
const column = columnMap[props.contentType]

// ตารางเชื่อมระหว่างเนื้อหากับไฟล์ต้นทาง (ใช้นับจำนวนไฟล์ที่แนบไปได้)
const junctionMap = {
  summary: 'summary_documents',
  quiz: 'quiz_documents',
  flashcard_set: 'flashcard_set_documents'
}
const junctionTable = junctionMap[props.contentType]

const isOpen = ref(false)
const isLoading = ref(false)
const isSaving = ref(false)
const errorMsg = ref('')
const shareRow = ref(null) // { share_id, share_token, is_active } | null
const justCopied = ref(false)
const includeFiles = ref(false) // ค่าที่ติ๊กไว้ตอนสร้างลิงก์ใหม่
const fileCount = ref(null) // จำนวนไฟล์ต้นทางของเนื้อหานี้ (null = ยังไม่รู้)

const shareUrl = computed(() =>
  shareRow.value ? `${window.location.origin}/share/${shareRow.value.share_token}` : ''
)

// โหลด Share ล่าสุดของเนื้อหานี้ (ถ้าเคยสร้างไว้แล้ว ไม่ว่าจะเปิดหรือปิดใช้งานอยู่)
async function loadShare() {
  isLoading.value = true
  errorMsg.value = ''

  const { data, error } = await supabase
    .from('shares')
    .select('share_id, share_token, is_active, include_source_files')
    .eq(column, props.contentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) errorMsg.value = 'โหลดข้อมูลแชร์ไม่สำเร็จ: ' + error.message
  else shareRow.value = data

  isLoading.value = false
}

async function loadFileCount() {
  const { count, error } = await supabase
    .from(junctionTable)
    .select('document_id', { count: 'exact', head: true })
    .eq(column, props.contentId)
  fileCount.value = error ? null : count
}

async function openDialog() {
  isOpen.value = true
  justCopied.value = false
  if (!shareRow.value) await loadShare()
  await loadFileCount()
}

function closeDialog() {
  isOpen.value = false
}

async function createLink() {
  isSaving.value = true
  errorMsg.value = ''

  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData?.user) {
    errorMsg.value = 'ไม่พบผู้ใช้ที่ล็อกอินอยู่ กรุณาล็อกอินใหม่'
    isSaving.value = false
    return
  }

  const { data, error } = await supabase
    .from('shares')
    .insert({
      owner_id: userData.user.id,
      [column]: props.contentId,
      include_source_files: includeFiles.value && fileCount.value !== 0
    })
    .select('share_id, share_token, is_active, include_source_files')
    .single()

  if (error) errorMsg.value = 'สร้างลิงก์แชร์ไม่สำเร็จ: ' + error.message
  else shareRow.value = data

  isSaving.value = false
}

// เปิด/ปิดการแชร์ — ไม่ลบ Row ทิ้ง แค่พลิก is_active (ลิงก์เดิมจะกลับมาใช้ได้ถ้าเปิดอีกครั้ง)
async function toggleActive() {
  if (!shareRow.value) return
  isSaving.value = true
  errorMsg.value = ''

  const { data, error } = await supabase
    .from('shares')
    .update({ is_active: !shareRow.value.is_active })
    .eq('share_id', shareRow.value.share_id)
    .select('share_id, share_token, is_active, include_source_files')
    .single()

  if (error) errorMsg.value = 'อัปเดตสถานะไม่สำเร็จ: ' + error.message
  else shareRow.value = data

  isSaving.value = false
}

// เปิด/ปิด "แนบไฟล์ต้นทาง" ของลิงก์ที่สร้างไว้แล้ว (มีผลกับคนที่ Clone หลังจากนี้เท่านั้น)
async function toggleIncludeFiles() {
  if (!shareRow.value) return
  isSaving.value = true
  errorMsg.value = ''

  const { data, error } = await supabase
    .from('shares')
    .update({ include_source_files: !shareRow.value.include_source_files })
    .eq('share_id', shareRow.value.share_id)
    .select('share_id, share_token, is_active, include_source_files')
    .single()

  if (error) errorMsg.value = 'อัปเดตการแนบไฟล์ไม่สำเร็จ: ' + error.message
  else shareRow.value = data

  isSaving.value = false
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    justCopied.value = true
    setTimeout(() => { justCopied.value = false }, 1500)
  } catch {
    // Clipboard API ใช้ไม่ได้ (เช่น ไม่ใช่ HTTPS) — เงียบไว้ ไม่ใช่ Error ร้ายแรง
  }
}
</script>

<template>
  <div class="share-wrap">
    <button class="share-trigger-btn" @click="openDialog">🔗 แชร์</button>

    <div v-if="isOpen" class="share-backdrop" @click.self="closeDialog">
      <div class="share-popover">
        <div class="share-popover-header">
          <span>แชร์ให้เพื่อน</span>
          <button class="close-btn" @click="closeDialog" aria-label="ปิด">✕</button>
        </div>

        <p v-if="isLoading" class="status-text">กำลังโหลด...</p>
        <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>

        <template v-if="!isLoading">
          <!-- ยังไม่เคยสร้างลิงก์แชร์ -->
          <div v-if="!shareRow">
            <p class="hint-text">
              คนที่ได้ลิงก์นี้จะเห็นตัวอย่างก่อน แล้วเลือก Clone เป็นสำเนาของตัวเองได้
              (ไม่ใช่การแชร์สิทธิ์แก้ไขต้นฉบับ)
            </p>
            <label class="attach-option" :class="{ 'attach-disabled': fileCount === 0 }">
              <input type="checkbox" v-model="includeFiles" :disabled="fileCount === 0" />
              <span>
                แนบไฟล์ต้นทางไปด้วย
                <template v-if="fileCount !== null">({{ fileCount }} ไฟล์)</template>
              </span>
            </label>
            <p v-if="fileCount === 0" class="attach-warning">เนื้อหานี้ไม่มีไฟล์ต้นทางให้แนบ</p>
            <p v-else-if="includeFiles" class="attach-warning">
              ผู้ที่ Clone จะได้รับสำเนาไฟล์ต้นฉบับของคุณลงบัญชีตัวเอง (ดาวน์โหลดและใช้ต่อได้)
              โปรดแนบเฉพาะไฟล์ที่คุณมีสิทธิ์แจกจ่ายได้
            </p>
            <button class="primary-btn" :disabled="isSaving" @click="createLink">
              {{ isSaving ? 'กำลังสร้าง...' : 'สร้างลิงก์แชร์' }}
            </button>
          </div>

          <!-- มีลิงก์แชร์อยู่แล้ว -->
          <div v-else>
            <div class="link-row">
              <input
                class="link-input"
                type="text"
                :value="shareUrl"
                readonly
                @focus="$event.target.select()"
              />
              <button class="copy-btn" @click="copyLink">
                {{ justCopied ? 'คัดลอกแล้ว ✓' : 'คัดลอก' }}
              </button>
            </div>

            <p class="status-note" :class="shareRow.is_active ? 'status-active' : 'status-inactive'">
              {{ shareRow.is_active ? '● ลิงก์เปิดใช้งานอยู่' : '● ลิงก์ถูกปิดใช้งานอยู่ (คนอื่นเปิดดูไม่ได้)' }}
            </p>

            <label class="attach-option" :class="{ 'attach-disabled': fileCount === 0 }">
              <input
                type="checkbox"
                :checked="shareRow.include_source_files"
                :disabled="isSaving || fileCount === 0"
                @change="toggleIncludeFiles"
              />
              <span>
                แนบไฟล์ต้นทางไปด้วย
                <template v-if="fileCount !== null">({{ fileCount }} ไฟล์)</template>
              </span>
            </label>
            <p v-if="shareRow.include_source_files" class="attach-warning">
              ผู้ที่ Clone หลังจากนี้จะได้รับสำเนาไฟล์ต้นฉบับ (คนที่ Clone ไปแล้วไม่ได้รับย้อนหลัง)
            </p>

            <button class="toggle-btn" :disabled="isSaving" @click="toggleActive">
              {{ isSaving ? 'กำลังบันทึก...' : (shareRow.is_active ? 'ปิดการแชร์' : 'เปิดการแชร์อีกครั้ง') }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.share-wrap {
  display: inline-block;
}

.share-trigger-btn {
  padding: 0.5rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--card);
  color: var(--ink);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.share-trigger-btn:hover {
  border-color: var(--indigo);
  color: var(--indigo);
}

.share-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(27, 29, 41, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 50;
}

.share-popover {
  background: var(--card);
  border-radius: 14px;
  padding: 1.25rem;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 30px rgba(27, 29, 41, 0.2);
}

.share-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  font-family: var(--font-heading);
  margin-bottom: 0.9rem;
}

.close-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--ink-soft);
  line-height: 1;
}

.status-text {
  color: var(--ink-soft);
  font-size: 0.85rem;
}

.error-text {
  color: var(--danger);
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}

.hint-text {
  font-size: 0.85rem;
  color: var(--ink-soft);
  line-height: 1.6;
  margin: 0 0 1rem;
}

.primary-btn {
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  border: none;
  background: var(--indigo);
  color: #ffffff;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}

.primary-btn:hover:not(:disabled) {
  background: var(--indigo-dark);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.link-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.link-input {
  flex: 1;
  min-width: 0;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  font-size: 0.82rem;
  font-family: var(--font-body);
  color: var(--ink-soft);
  background: var(--paper);
}

.copy-btn {
  padding: 0.55rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--card);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.copy-btn:hover {
  border-color: var(--indigo);
  color: var(--indigo);
}

.status-note {
  font-size: 0.8rem;
  font-weight: 600;
  margin: 0 0 0.9rem;
}

.status-active {
  color: var(--success);
}

.status-inactive {
  color: var(--danger);
}

.toggle-btn {
  width: 100%;
  padding: 0.55rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: none;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.attach-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0 0.4rem;
  font-size: 0.88rem;
  color: var(--ink);
  cursor: pointer;
}

.attach-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.attach-warning {
  margin: 0 0 0.75rem;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--ink-soft);
}
</style>