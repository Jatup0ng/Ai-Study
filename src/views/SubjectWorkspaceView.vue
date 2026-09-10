<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '../supabaseClient'
import { useAuth } from '../composables/useAuth'

const props = defineProps({
  id: { type: String, required: true }
})

const { user } = useAuth()

const subject = ref(null)
const documents = ref([])
const summaries = ref([]) // [{ summary_id, content, created_at, file_names: [...] }]

const isLoadingSubject = ref(true)
const isLoadingDocuments = ref(true)
const isLoadingSummaries = ref(true)
const errorMessage = ref('')

const STATUS_LABEL = {
  processing: 'กำลังประมวลผล',
  ready: 'พร้อมใช้งาน',
  failed: 'ประมวลผลไม่สำเร็จ'
}

async function fetchSubject() {
  isLoadingSubject.value = true
  const { data, error } = await supabase
    .from('subjects')
    .select('id, name, created_at')
    .eq('id', props.id)
    .maybeSingle()

  if (error) errorMessage.value = 'โหลดข้อมูลวิชาไม่สำเร็จ: ' + error.message
  else if (!data) errorMessage.value = 'ไม่พบวิชานี้ หรือคุณไม่มีสิทธิ์เข้าถึง'
  else subject.value = data
  isLoadingSubject.value = false
}

async function fetchDocuments() {
  isLoadingDocuments.value = true
  const { data, error } = await supabase
    .from('documents')
    .select('document_id, file_name, file_url, status, uploaded_at')
    .eq('subject_id', props.id)
    .order('uploaded_at', { ascending: false })

  if (error) errorMessage.value = errorMessage.value || ('โหลดรายการเอกสารไม่สำเร็จ: ' + error.message)
  else documents.value = data
  isLoadingDocuments.value = false
}

// ดึง Summary ของวิชานี้ทั้งหมด แล้วต่อด้วยชื่อไฟล์ต้นทางผ่าน Junction Table
// (summary_documents) เพราะ Summary แบบหลายไฟล์ไม่มี document_id เดี่ยวให้ join ตรงๆ
async function fetchSummaries() {
  isLoadingSummaries.value = true

  const { data: rows, error } = await supabase
    .from('summaries')
    .select('summary_id, content, created_at')
    .eq('subject_id', props.id)
    .order('created_at', { ascending: false })

  if (error || !rows) {
    isLoadingSummaries.value = false
    return
  }

  const summaryIds = rows.map((r) => r.summary_id)
  let fileNamesBySummary = {}

  if (summaryIds.length > 0) {
    const { data: links } = await supabase
      .from('summary_documents')
      .select('summary_id, documents ( file_name )')
      .in('summary_id', summaryIds)

    for (const link of links || []) {
      const list = fileNamesBySummary[link.summary_id] || []
      list.push(link.documents?.file_name)
      fileNamesBySummary[link.summary_id] = list
    }
  }

  summaries.value = rows.map((r) => ({
    ...r,
    file_names: (fileNamesBySummary[r.summary_id] || []).filter(Boolean)
  }))
  isLoadingSummaries.value = false
}

function fileKind(fileName) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'PDF'
  if (ext === 'docx') return 'Word'
  if (ext === 'pptx') return 'PowerPoint'
  return 'ไฟล์'
}

function formatDate(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

function snippet(content, length = 110) {
  if (!content) return ''
  return content.length > length ? content.slice(0, length).trim() + '…' : content
}

onMounted(async () => {
  await Promise.all([fetchSubject(), fetchDocuments()])
  await fetchSummaries()
})

// --- อัปโหลดเอกสาร ---
const ALLOWED_MIME_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
}
const MAX_FILE_SIZE = 10 * 1024 * 1024

const fileInput = ref(null)
const isUploading = ref(false)
const uploadError = ref('')

function openFilePicker() {
  fileInput.value?.click()
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

async function handleFileSelect(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  uploadError.value = ''
  if (!ALLOWED_MIME_TYPES[file.type]) {
    uploadError.value = 'รองรับเฉพาะไฟล์ PDF, Word (.docx), และ PowerPoint (.pptx) เท่านั้น'
    return
  }
  if (file.size > MAX_FILE_SIZE) {
    uploadError.value = 'ไฟล์ต้องมีขนาดไม่เกิน 10MB'
    return
  }
  await uploadFile(file)
}

async function uploadFile(file) {
  isUploading.value = true
  uploadError.value = ''

  try {
    const storagePath = `${user.value.id}/${Date.now()}-${sanitizeFileName(file.name)}`
    const { error: storageErr } = await supabase.storage.from('documents').upload(storagePath, file)
    if (storageErr) throw storageErr

    const { data, error: insertErr } = await supabase
      .from('documents')
      .insert({
        user_id: user.value.id,
        subject_id: props.id,
        file_name: file.name,
        file_url: storagePath,
        status: 'ready'
      })
      .select('document_id, file_name, file_url, status, uploaded_at')
      .single()

    if (insertErr) {
      await supabase.storage.from('documents').remove([storagePath])
      throw insertErr
    }

    documents.value.unshift(data)
  } catch (err) {
    uploadError.value = 'อัปโหลดไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')
  } finally {
    isUploading.value = false
  }
}

// --- เลือกหลายเอกสารด้วย Checkbox (แหล่งเอกสารสำหรับสรุปรวม) ---
// เก็บเป็น Array เรียงตามลำดับที่ผู้ใช้ติ๊กเลือก เพื่อส่งให้ Edge Function
// เรียงบทตามที่ผู้ใช้ตั้งใจ ไม่ใช่ลำดับสุ่มจาก Set
const selectedDocumentIds = ref([])

function isSelected(docId) {
  return selectedDocumentIds.value.includes(docId)
}

function toggleDocument(docId) {
  const idx = selectedDocumentIds.value.indexOf(docId)
  if (idx === -1) selectedDocumentIds.value.push(docId)
  else selectedDocumentIds.value.splice(idx, 1)
}

const selectedCount = computed(() => selectedDocumentIds.value.length)

// --- ลบเอกสาร ---
const deletingDocumentId = ref(null)
const deleteError = ref('')

async function handleDeleteDocument(doc) {
  if (!confirm(`ต้องการลบเอกสาร "${doc.file_name}" ใช่หรือไม่? การลบนี้ไม่สามารถกู้คืนได้`)) return

  deleteError.value = ''
  deletingDocumentId.value = doc.document_id

  try {
    const { error: dbErr } = await supabase.from('documents').delete().eq('document_id', doc.document_id)
    if (dbErr) throw dbErr

    const { error: storageErr } = await supabase.storage.from('documents').remove([doc.file_url])
    if (storageErr) console.error('ลบไฟล์ใน Storage ไม่สำเร็จ:', storageErr.message)

    documents.value = documents.value.filter((d) => d.document_id !== doc.document_id)
    toggleIfSelected(doc.document_id)
  } catch (err) {
    deleteError.value = 'ลบเอกสารไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')
  } finally {
    deletingDocumentId.value = null
  }
}

function toggleIfSelected(docId) {
  const idx = selectedDocumentIds.value.indexOf(docId)
  if (idx !== -1) selectedDocumentIds.value.splice(idx, 1)
}

// --- สร้าง Summary รวมจากไฟล์ที่เลือก (รองรับ 1 หรือหลายไฟล์) ---
const isGenerating = ref(false)
const generateError = ref('')

async function handleGenerateSummary() {
  if (selectedDocumentIds.value.length === 0) return

  isGenerating.value = true
  generateError.value = ''

  try {
    const { data, error } = await supabase.functions.invoke('generate-summary', {
      body: { document_ids: selectedDocumentIds.value }
    })

    if (error) throw new Error(error.message || 'เรียก Edge Function ไม่สำเร็จ')
    if (data?.error) throw new Error(data.error)

    selectedDocumentIds.value = []
    await fetchSummaries()
  } catch (err) {
    generateError.value = err.message || 'สร้าง Summary ไม่สำเร็จ'
  } finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <div class="page">
    <RouterLink :to="{ name: 'subjects' }" class="back-link">← วิชาของฉัน</RouterLink>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    <p v-if="isLoadingSubject" class="status-text">กำลังโหลด...</p>

    <template v-else-if="subject">
      <header class="page-header">
        <h1>{{ subject.name }}</h1>
        <div>
          <input
            ref="fileInput"
            type="file"
            accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            hidden
            @change="handleFileSelect"
          />
          <button class="upload-btn" :disabled="isUploading" @click="openFilePicker">
            {{ isUploading ? 'กำลังอัปโหลด...' : '+ อัปโหลดเอกสาร' }}
          </button>
        </div>
      </header>

      <p v-if="uploadError" class="error-text">{{ uploadError }}</p>
      <p class="upload-hint">รองรับ PDF, Word (.docx), PowerPoint (.pptx) ขนาดไม่เกิน 10MB</p>

      <div class="workspace">
        <!-- ฝั่งซ้าย: แหล่งเอกสาร (Sources) -->
        <section class="sources-pane">
          <h2 class="pane-title">แหล่งเอกสาร</h2>
          <p class="pane-hint">ติ๊กเลือกได้หลายไฟล์ เพื่อรวมเป็นสรุปเดียวกัน</p>

          <p v-if="isLoadingDocuments" class="status-text">กำลังโหลดเอกสาร...</p>
          <p v-else-if="documents.length === 0" class="status-text">
            ยังไม่มีเอกสารในวิชานี้ — อัปโหลดไฟล์แรกด้านบนได้เลย
          </p>
          <p v-if="deleteError" class="error-text">{{ deleteError }}</p>

          <ul v-if="!isLoadingDocuments && documents.length > 0" class="source-list">
            <li
              v-for="doc in documents"
              :key="doc.document_id"
              class="source-item"
              :class="{ 'is-checked': isSelected(doc.document_id) }"
            >
              <label class="source-row">
                <input
                  type="checkbox"
                  class="source-checkbox"
                  :checked="isSelected(doc.document_id)"
                  @change="toggleDocument(doc.document_id)"
                />
                <div class="source-info">
                  <span class="source-name">{{ doc.file_name }}</span>
                  <span class="source-meta">
                    <span class="source-kind">{{ fileKind(doc.file_name) }}</span>
                    <span class="status-badge" :class="'status-' + doc.status">
                      {{ STATUS_LABEL[doc.status] || doc.status }}
                    </span>
                    <span class="source-date">{{ formatDate(doc.uploaded_at) }}</span>
                  </span>
                </div>
                <button
                  type="button"
                  class="delete-doc-btn"
                  :disabled="deletingDocumentId === doc.document_id"
                  @click.stop.prevent="handleDeleteDocument(doc)"
                >
                  {{ deletingDocumentId === doc.document_id ? '...' : 'ลบ' }}
                </button>
              </label>
            </li>
          </ul>
        </section>

        <!-- ฝั่งขวา: Studio -->
        <section class="studio-pane">
          <h2 class="pane-title">Studio</h2>

          <div class="generate-box">
            <p class="generate-status">
              <template v-if="selectedCount === 0">เลือกเอกสารทางซ้ายเพื่อเริ่มสรุป</template>
              <template v-else>เลือกไว้ {{ selectedCount }} ไฟล์</template>
            </p>
            <button
              class="generate-btn"
              :disabled="selectedCount === 0 || isGenerating"
              @click="handleGenerateSummary"
            >
              {{ isGenerating ? 'AI กำลังสรุป... (อาจใช้เวลาสักครู่)' : '✨ สรุปรวมจากไฟล์ที่เลือก' }}
            </button>
            <p v-if="generateError" class="error-text">{{ generateError }}</p>
          </div>

          <h3 class="sub-title">สรุปที่มีอยู่แล้ว</h3>
          <p v-if="isLoadingSummaries" class="status-text">กำลังโหลด...</p>
          <p v-else-if="summaries.length === 0" class="status-text">ยังไม่มีสรุปในวิชานี้</p>

          <ul v-else class="summary-list">
            <li v-for="s in summaries" :key="s.summary_id" class="summary-card">
              <RouterLink :to="{ name: 'summary-detail', params: { summaryId: s.summary_id } }" class="summary-link">
                <span class="ai-badge">AI สรุปให้</span>
                <p class="summary-snippet">{{ snippet(s.content) }}</p>
                <p class="summary-meta">
                  <template v-if="s.file_names.length">จาก {{ s.file_names.length }} ไฟล์ · </template>
                  {{ formatDate(s.created_at) }}
                </p>
              </RouterLink>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: 960px;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.page-header h1 {
  font-size: 1.6rem;
  margin: 0;
}

.upload-btn {
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  border: none;
  background: var(--indigo);
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.upload-btn:hover:not(:disabled) {
  background: var(--indigo-dark);
}

.upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.upload-hint {
  font-size: 0.8rem;
  color: var(--ink-faint);
  margin: 0 0 1.5rem;
}

.status-text {
  color: var(--ink-soft);
  font-size: 0.9rem;
}

.error-text {
  color: var(--danger);
  font-size: 0.85rem;
  margin: 0.5rem 0;
}

.workspace {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: 1.5rem;
  align-items: start;
}

@media (max-width: 760px) {
  .workspace {
    grid-template-columns: 1fr;
  }
}

.pane-title {
  font-size: 1rem;
  margin: 0 0 0.25rem;
}

.pane-hint {
  font-size: 0.8rem;
  color: var(--ink-faint);
  margin: 0 0 1rem;
}

.sub-title {
  font-size: 0.9rem;
  margin: 1.75rem 0 0.75rem;
  color: var(--ink-soft);
}

/* --- Sources pane --- */
.source-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.source-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  transition: border-color 0.12s ease, background 0.12s ease;
}

.source-item.is-checked {
  border-color: var(--highlighter);
  background: var(--highlighter-soft);
}

.source-row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.8rem 0.9rem;
  cursor: pointer;
}

.source-checkbox {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  accent-color: var(--indigo);
  cursor: pointer;
}

.source-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.source-name {
  font-size: 0.92rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.source-kind {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--ink-soft);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 0.1rem 0.35rem;
}

.source-date {
  font-size: 0.75rem;
  color: var(--ink-faint);
}

.status-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 20px;
}

.status-processing {
  background: #fdf0d5;
  color: #8a5a00;
}

.status-ready {
  background: var(--success-bg);
  color: var(--success);
}

.status-failed {
  background: var(--danger-bg);
  color: var(--danger);
}

.delete-doc-btn {
  flex-shrink: 0;
  background: none;
  border: 1px solid var(--border-strong);
  color: var(--danger);
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
  font-size: 0.72rem;
  cursor: pointer;
}

.delete-doc-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- Studio pane --- */
.generate-box {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card);
  padding: 1.1rem;
}

.generate-status {
  font-size: 0.85rem;
  color: var(--ink-soft);
  margin: 0 0 0.75rem;
}

.generate-btn {
  width: 100%;
  padding: 0.7rem 1rem;
  border-radius: 8px;
  border: none;
  background: var(--indigo);
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.generate-btn:hover:not(:disabled) {
  background: var(--indigo-dark);
}

.generate-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.summary-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.summary-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.summary-card:hover {
  border-color: var(--border-strong);
  box-shadow: 0 2px 10px rgba(27, 29, 41, 0.06);
}

.summary-link {
  display: block;
  padding: 0.9rem 1rem;
  color: inherit;
  text-decoration: none;
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

.summary-snippet {
  font-size: 0.88rem;
  line-height: 1.6;
  margin: 0 0 0.4rem;
  color: var(--ink);
}

.summary-meta {
  font-size: 0.75rem;
  color: var(--ink-faint);
  margin: 0;
}
</style>
