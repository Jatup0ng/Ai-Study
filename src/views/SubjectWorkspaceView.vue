<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { supabase } from '../supabaseClient'
import { useAuth } from '../composables/useAuth'
import { confirmDialog, toast } from '../composables/useDialog'

const props = defineProps({
  id: { type: String, required: true }
})

const { user } = useAuth()
const router = useRouter()

// ---- รับลิงก์แชร์จากเพื่อน: วางลิงก์ -> ไปหน้า Preview โดยเลือกวิชานี้เป็นปลายทางไว้ให้ ----
const shareLinkInput = ref('')
const shareLinkError = ref('')

// รับได้ทั้งลิงก์เต็ม (.../share/<token>) หรือวางเฉพาะ token (48 ตัวอักษร a-z A-Z 0-9 _ -)
function extractShareToken(text) {
  const t = text.trim()
  const fromUrl = t.match(/\/share\/([A-Za-z0-9_-]+)/)
  if (fromUrl) return fromUrl[1]
  if (/^[A-Za-z0-9_-]{20,}$/.test(t)) return t
  return null
}

function openSharedLink() {
  shareLinkError.value = ''
  const token = extractShareToken(shareLinkInput.value)
  if (!token) {
    shareLinkError.value = 'ลิงก์ไม่ถูกต้อง — วางลิงก์ที่ได้จากเพื่อน (หน้าตาแบบ .../share/xxxx)'
    return
  }
  router.push({ name: 'share-preview', params: { token }, query: { subject: props.id } })
}

const subject = ref(null)

// สีประจำวิชา — Hash ชื่อวิชาเหมือนหน้ารายการวิชา เพื่อให้ได้สีเดิมเสมอ
const SUBJECT_COLOR_COUNT = 6
const subjectColorStyle = computed(() => {
  let hash = 0
  for (const ch of subject.value?.name || '') hash = (hash * 31 + ch.charCodeAt(0)) % SUBJECT_COLOR_COUNT
  return { '--c': `var(--subj-${Math.abs(hash) + 1})` }
})
const subjectInitial = computed(() => (subject.value?.name || '').trim().charAt(0).toUpperCase())
const documents = ref([])
const summaries = ref([]) // [{ summary_id, content, created_at, file_names: [...] }]
const quizzes = ref([]) // [{ quiz_id, title, created_at, question_count, file_names: [...] }]
const flashcardSets = ref([]) // [{ flashcard_set_id, title, created_at, card_count, file_names: [...] }]

const isLoadingSubject = ref(true)
const isLoadingDocuments = ref(true)
const isLoadingSummaries = ref(true)
const isLoadingQuizzes = ref(true)
const isLoadingFlashcardSets = ref(true)
const errorMessage = ref('')

// Studio Panel มี 3 แท็บ: สร้าง Summary / Quiz / Flashcard ใช้ selectedDocumentIds ชุดเดียวกัน
const activeStudioTab = ref('summary') // 'summary' | 'quiz' | 'flashcard'

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

// ดึง Quiz ของวิชานี้ทั้งหมด แล้วต่อด้วยชื่อไฟล์ต้นทาง + จำนวนคำถามผ่าน Junction Table
// (quiz_documents) เหมือน Pattern ของ fetchSummaries
async function fetchQuizzes() {
  isLoadingQuizzes.value = true

  const { data: rows, error } = await supabase
    .from('quizzes')
    .select('quiz_id, title, created_at')
    .eq('subject_id', props.id)
    .order('created_at', { ascending: false })

  if (error || !rows) {
    isLoadingQuizzes.value = false
    return
  }

  const quizIds = rows.map((r) => r.quiz_id)
  let fileNamesByQuiz = {}
  let questionCountByQuiz = {}

  if (quizIds.length > 0) {
    const [{ data: links }, { data: questionRows }] = await Promise.all([
      supabase.from('quiz_documents').select('quiz_id, documents ( file_name )').in('quiz_id', quizIds),
      supabase.from('questions').select('quiz_id').in('quiz_id', quizIds)
    ])

    for (const link of links || []) {
      const list = fileNamesByQuiz[link.quiz_id] || []
      list.push(link.documents?.file_name)
      fileNamesByQuiz[link.quiz_id] = list
    }
    for (const q of questionRows || []) {
      questionCountByQuiz[q.quiz_id] = (questionCountByQuiz[q.quiz_id] || 0) + 1
    }
  }

  quizzes.value = rows.map((r) => ({
    ...r,
    file_names: (fileNamesByQuiz[r.quiz_id] || []).filter(Boolean),
    question_count: questionCountByQuiz[r.quiz_id] || 0
  }))
  isLoadingQuizzes.value = false
}

// ดึง Flashcard Set ของวิชานี้ทั้งหมด แล้วต่อด้วยชื่อไฟล์ต้นทาง + จำนวนใบ
// ผ่าน Junction Table (flashcard_set_documents) เหมือน Pattern ของ fetchQuizzes
async function fetchFlashcardSets() {
  isLoadingFlashcardSets.value = true

  const { data: rows, error } = await supabase
    .from('flashcard_sets')
    .select('flashcard_set_id, title, created_at')
    .eq('subject_id', props.id)
    .order('created_at', { ascending: false })

  if (error || !rows) {
    isLoadingFlashcardSets.value = false
    return
  }

  const setIds = rows.map((r) => r.flashcard_set_id)
  let fileNamesBySet = {}
  let cardCountBySet = {}

  if (setIds.length > 0) {
    const [{ data: links }, { data: cardRows }] = await Promise.all([
      supabase.from('flashcard_set_documents').select('flashcard_set_id, documents ( file_name )').in('flashcard_set_id', setIds),
      supabase.from('flashcards').select('flashcard_set_id').in('flashcard_set_id', setIds)
    ])

    for (const link of links || []) {
      const list = fileNamesBySet[link.flashcard_set_id] || []
      list.push(link.documents?.file_name)
      fileNamesBySet[link.flashcard_set_id] = list
    }
    for (const c of cardRows || []) {
      cardCountBySet[c.flashcard_set_id] = (cardCountBySet[c.flashcard_set_id] || 0) + 1
    }
  }

  flashcardSets.value = rows.map((r) => ({
    ...r,
    file_names: (fileNamesBySet[r.flashcard_set_id] || []).filter(Boolean),
    card_count: cardCountBySet[r.flashcard_set_id] || 0
  }))
  isLoadingFlashcardSets.value = false
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

// Summary ไม่มีคอลัมน์ title — ดึงชื่อหัวข้อจากบรรทัดแรกของเนื้อหา แล้วลบสัญลักษณ์ Markdown ออก
// (รองรับทั้งสรุปเก่าที่ขึ้นต้นด้วย **ตัวหนา** / bullet และสรุปใหม่ที่ขึ้นต้นด้วย # หัวข้อ)
function summaryTitle(content, maxLength = 70) {
  if (!content) return 'สรุปเนื้อหา'
  const lines = content.split('\n').map((l) => l.trim()).filter((l) => l && !/^[-*_]{3,}$/.test(l))
  const heading = lines.find((l) => /^#{1,3}\s/.test(l))
  let title = (heading || lines[0] || '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*+>]\s+/, '')
    .replace(/\$([^$]*)\$/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/^ชีทสรุป(สอบ)?\s*[:：]\s*/, '')
    .trim()
  if (!title) return 'สรุปเนื้อหา'
  return title.length > maxLength ? title.slice(0, maxLength).trim() + '…' : title
}

onMounted(async () => {
  await Promise.all([fetchSubject(), fetchDocuments()])
  await Promise.all([fetchSummaries(), fetchQuizzes(), fetchFlashcardSets()])
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
const isDragging = ref(false)

function openFilePicker() {
  fileInput.value?.click()
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

async function handleFileSelect(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  await acceptFile(file)
}

// ลากไฟล์มาวางบนหัวหน้าได้เหมือนกัน (ใช้ตัวตรวจชนิด/ขนาดเดียวกับปุ่มอัปโหลด)
async function handleDrop(event) {
  isDragging.value = false
  await acceptFile(event.dataTransfer?.files?.[0])
}

async function acceptFile(file) {
  if (!file || isUploading.value) return
  if (!ALLOWED_MIME_TYPES[file.type]) {
    toast.warning('รองรับเฉพาะไฟล์ PDF, Word (.docx) และ PowerPoint (.pptx) เท่านั้น', { title: 'ชนิดไฟล์ไม่รองรับ' })
    return
  }
  if (file.size > MAX_FILE_SIZE) {
    toast.warning('ไฟล์ต้องมีขนาดไม่เกิน 10MB', { title: 'ไฟล์ใหญ่เกินไป' })
    return
  }
  await uploadFile(file)
}

async function uploadFile(file) {
  isUploading.value = true

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
    toast.success(`อัปโหลด "${file.name}" แล้ว`)
  } catch (err) {
    toast.error('อัปโหลดไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'))
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
const allSelected = computed(
  () => documents.value.length > 0 && selectedDocumentIds.value.length === documents.value.length
)

function toggleSelectAll() {
  selectedDocumentIds.value = allSelected.value ? [] : documents.value.map((d) => d.document_id)
}

const selectedDocuments = computed(() =>
  selectedDocumentIds.value.map((id) => documents.value.find((d) => d.document_id === id)).filter(Boolean)
)

// --- ลบเนื้อหา (Summary / Quiz / Flashcard Set) ---
// ลบแค่เนื้อหานั้น ไม่ลบไฟล์ต้นทาง (ไฟล์อาจใช้กับเนื้อหาอื่นอยู่ — ลบไฟล์แยกที่ปุ่มลบเอกสาร)
// DB ตั้ง ON DELETE CASCADE ไว้แล้ว: ตารางเชื่อมไฟล์ / คำถาม+ตัวเลือก / ประวัติทำควิส / บัตร / ลิงก์แชร์ จะถูกลบตามอัตโนมัติ
// สำเนาที่คนอื่น Clone ไปแล้วเป็นของเขาเอง (source_*_id เป็น SET NULL) ไม่กระทบ
const CONTENT_KINDS = {
  summary: { table: 'summaries', idCol: 'summary_id', label: 'สรุป' },
  quiz: { table: 'quizzes', idCol: 'quiz_id', label: 'Quiz' },
  flashcard_set: { table: 'flashcard_sets', idCol: 'flashcard_set_id', label: 'Flashcard' }
}
const deletingContentKey = ref('') // เช่น 'quiz:12' (กันกดซ้ำ + แสดง ... บนปุ่ม)

async function handleDeleteContent(kind, id, displayName) {
  const cfg = CONTENT_KINDS[kind]

  // เช็คของที่จะหายไปพร้อมกัน เพื่อเตือนผู้ใช้ให้ตรงความจริง
  const checks = [
    supabase.from('shares').select('share_id', { count: 'exact', head: true }).eq(cfg.idCol, id).eq('is_active', true)
  ]
  if (kind === 'quiz') {
    checks.push(supabase.from('quiz_attempts').select('attempt_id', { count: 'exact', head: true }).eq('quiz_id', id))
  }
  const [shareRes, attemptRes] = await Promise.all(checks)
  const activeShares = shareRes?.count || 0
  const attempts = attemptRes?.count || 0

  const items = []
  const warnings = []
  if (kind === 'quiz' && attempts > 0) {
    items.push({ label: 'ประวัติการทำแบบทดสอบ', value: `${attempts} ครั้ง` })
    warnings.push('ประวัติการทำแบบทดสอบของ Quiz นี้จะถูกลบไปด้วย')
  }
  if (activeShares > 0) {
    items.push({ label: 'ลิงก์แชร์ที่เปิดอยู่', value: activeShares })
    warnings.push(
      `${cfg.label}นี้มีลิงก์แชร์ที่เปิดอยู่ หลังลบแล้วลิงก์จะใช้ไม่ได้ ` +
        '(คนที่ Clone ไปก่อนหน้านี้ยังมีสำเนาของตัวเอง ไม่ได้รับผลกระทบ)'
    )
  }

  const ok = await confirmDialog({
    tone: 'danger',
    title: `ลบ${cfg.label} "${displayName}" ?`,
    message: 'การลบนี้ไม่สามารถกู้คืนได้ — ไฟล์ต้นทางจะไม่ถูกลบ',
    items,
    warnings,
    confirmText: `ลบ${cfg.label}`
  })
  if (!ok) return

  const key = `${kind}:${id}`
  deletingContentKey.value = key
  try {
    // .select() เพื่อเช็คว่าลบได้จริง (ถ้า RLS ไม่อนุญาต Supabase จะไม่ error แต่ลบ 0 แถว)
    const { data, error } = await supabase.from(cfg.table).delete().eq(cfg.idCol, id).select(cfg.idCol)
    if (error) throw error
    if (!data || data.length === 0) throw new Error('ไม่พบรายการนี้ หรือไม่มีสิทธิ์ลบ')

    if (kind === 'summary') summaries.value = summaries.value.filter((x) => x.summary_id !== id)
    else if (kind === 'quiz') quizzes.value = quizzes.value.filter((x) => x.quiz_id !== id)
    else flashcardSets.value = flashcardSets.value.filter((x) => x.flashcard_set_id !== id)
    toast.success(`ลบ${cfg.label}แล้ว`)
  } catch (err) {
    toast.error(`ลบ${cfg.label}ไม่สำเร็จ: ` + (err.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'))
  } finally {
    deletingContentKey.value = ''
  }
}

// --- ลบเอกสาร ---
const deletingDocumentId = ref(null)

async function handleDeleteDocument(doc) {
  // เช็คก่อนว่าเอกสารนี้ถูกใช้สร้าง Summary/Quiz/Flashcard ไว้กี่รายการ เพื่อเตือนก่อนลบ
  const [{ data: summaryLinks }, { data: quizLinks }, { data: flashcardLinks }] = await Promise.all([
    supabase.from('summary_documents').select('summary_id').eq('document_id', doc.document_id),
    supabase.from('quiz_documents').select('quiz_id').eq('document_id', doc.document_id),
    supabase.from('flashcard_set_documents').select('flashcard_set_id').eq('document_id', doc.document_id)
  ])

  const affectedSummaryCount = new Set((summaryLinks || []).map((l) => l.summary_id)).size
  const affectedQuizCount = new Set((quizLinks || []).map((l) => l.quiz_id)).size
  const affectedFlashcardCount = new Set((flashcardLinks || []).map((l) => l.flashcard_set_id)).size

  const items = []
  const warnings = []
  if (affectedSummaryCount > 0) {
    items.push({ label: 'สรุปที่ใช้ไฟล์นี้', value: affectedSummaryCount })
    warnings.push('สรุปเหล่านั้นจะใช้แชทกับเอกสารไม่ได้อีก (เนื้อหาสรุปยังอ่าน/แก้ไขได้ตามปกติ)')
  }
  if (affectedQuizCount > 0) {
    items.push({ label: 'Quiz ที่ใช้ไฟล์นี้', value: affectedQuizCount })
    warnings.push('Quiz ยังทำได้ตามปกติ แค่จะไม่เหลือ Reference ไปยังไฟล์ต้นทางนี้')
  }
  if (affectedFlashcardCount > 0) {
    items.push({ label: 'Flashcard ที่ใช้ไฟล์นี้', value: affectedFlashcardCount })
    warnings.push('Flashcard ยังทบทวนได้ตามปกติ แค่จะไม่เหลือ Reference ไปยังไฟล์ต้นทางนี้')
  }

  const ok = await confirmDialog({
    tone: 'danger',
    title: `ลบเอกสาร "${doc.file_name}" ?`,
    message: 'การลบนี้ไม่สามารถกู้คืนได้',
    items,
    warnings,
    confirmText: 'ลบเอกสาร'
  })
  if (!ok) return

  deletingDocumentId.value = doc.document_id

  try {
    const { error: dbErr } = await supabase.from('documents').delete().eq('document_id', doc.document_id)
    if (dbErr) throw dbErr

    const { error: storageErr } = await supabase.storage.from('documents').remove([doc.file_url])
    if (storageErr) console.error('ลบไฟล์ใน Storage ไม่สำเร็จ:', storageErr.message)

    documents.value = documents.value.filter((d) => d.document_id !== doc.document_id)
    toggleIfSelected(doc.document_id)
    toast.success(`ลบเอกสาร "${doc.file_name}" แล้ว`)
  } catch (err) {
    toast.error('ลบเอกสารไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'))
  } finally {
    deletingDocumentId.value = null
  }
}

function toggleIfSelected(docId) {
  const idx = selectedDocumentIds.value.indexOf(docId)
  if (idx !== -1) selectedDocumentIds.value.splice(idx, 1)
}

// --- สร้าง Summary / Quiz / Flashcard จากไฟล์ที่เลือก (รองรับ 1 หรือหลายไฟล์) ---
const isGenerating = ref(false)
const isGeneratingQuiz = ref(false)
const isGeneratingFlashcard = ref(false)
const quizQuestionCount = ref(8)
const flashcardCardCount = ref(12) // ตรงกับ Default ของ Edge Function (1-40 ใบ)

const QUIZ_LIMITS = { min: 1, max: 30, fallback: 8 }
const FLASHCARD_LIMITS = { min: 1, max: 40, fallback: 12 }

// ช่องตัวเลขอาจว่าง/เป็นทศนิยม/เกินช่วง — บีบให้อยู่ในช่วงที่ Edge Function รับก่อนส่งเสมอ
function clampCount(value, { min, max, fallback }) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function stepCount(refValue, delta, limits) {
  refValue.value = clampCount(clampCount(refValue.value, limits) + delta, limits)
}

async function runGenerate({ flag, fnName, body, failText, successText, refresh }) {
  if (selectedDocumentIds.value.length === 0 || flag.value) return
  flag.value = true
  try {
    const { data, error } = await supabase.functions.invoke(fnName, { body })
    if (error) throw new Error(await describeInvokeError(error))
    if (data?.error) throw new Error(data.error)

    selectedDocumentIds.value = []
    await refresh()
    toast.success(successText)
  } catch (err) {
    toast.error(err.message || failText, { title: failText })
  } finally {
    flag.value = false
  }
}

function handleGenerateSummary() {
  return runGenerate({
    flag: isGenerating,
    fnName: 'generate-summary',
    body: { document_ids: selectedDocumentIds.value },
    failText: 'สร้าง Summary ไม่สำเร็จ',
    successText: 'AI สรุปเนื้อหาให้เรียบร้อยแล้ว',
    refresh: fetchSummaries
  })
}

function handleGenerateQuiz() {
  quizQuestionCount.value = clampCount(quizQuestionCount.value, QUIZ_LIMITS)
  return runGenerate({
    flag: isGeneratingQuiz,
    fnName: 'generate-quiz',
    body: { document_ids: selectedDocumentIds.value, question_count: quizQuestionCount.value },
    failText: 'สร้าง Quiz ไม่สำเร็จ',
    successText: 'AI ออกข้อสอบให้เรียบร้อยแล้ว',
    refresh: fetchQuizzes
  })
}

function handleGenerateFlashcard() {
  flashcardCardCount.value = clampCount(flashcardCardCount.value, FLASHCARD_LIMITS)
  return runGenerate({
    flag: isGeneratingFlashcard,
    fnName: 'generate-flashcard',
    body: { document_ids: selectedDocumentIds.value, card_count: flashcardCardCount.value },
    failText: 'สร้าง Flashcard ไม่สำเร็จ',
    successText: 'AI ทำ Flashcard ให้เรียบร้อยแล้ว',
    refresh: fetchFlashcardSets
  })
}

// --- แปลง error จาก Edge Function ให้อ่านรู้เรื่อง (supabase-js ให้แค่ "non-2xx status code" ซึ่งไม่บอกสาเหตุ) ---
async function describeInvokeError(error) {
  const res = error?.context
  const status = res?.status
  if (status === 504 || status === 546 || status === 502 || status === 503) {
    return 'AI ใช้เวลานานเกินกำหนด (ฝั่ง Gemini ไม่ตอบกลับ) — ลองสร้างใหม่อีกครั้ง หรือลดจำนวนข้อ/จำนวนไฟล์'
  }
  try {
    const body = await res.json()
    if (body?.error) return body.error
  } catch {
    // body ไม่ใช่ JSON — ใช้ข้อความสำรองด้านล่าง
  }
  return error?.message || 'เรียก Edge Function ไม่สำเร็จ'
}

// --- แสดงเวลาที่รอ AI อยู่ (กันรู้สึกว่าหน้าค้าง) ---
const anyGenerating = computed(
  () => isGenerating.value || isGeneratingQuiz.value || isGeneratingFlashcard.value
)
const waitSeconds = ref(0)
let waitTimer = null

watch(anyGenerating, (busy) => {
  clearInterval(waitTimer)
  waitSeconds.value = 0
  if (busy) waitTimer = setInterval(() => waitSeconds.value++, 1000)
})

onBeforeUnmount(() => clearInterval(waitTimer))

// --- Studio: รวม 3 แท็บให้ใช้เทมเพลตเดียว ---
const STUDIO_TABS = [
  { key: 'summary', label: 'Summary', icon: '' },
  { key: 'quiz', label: 'Quiz', icon: '' },
  { key: 'flashcard', label: 'Flashcard', icon: '' }
]

const tabCount = computed(() => ({
  summary: summaries.value.length,
  quiz: quizzes.value.length,
  flashcard: flashcardSets.value.length
}))

const STUDIO_COPY = {
  summary: {
    idle: 'เลือกเอกสารทางซ้ายเพื่อเริ่มสรุป',
    busy: 'AI กำลังสรุป... (อาจใช้เวลาสักครู่)',
    action: ' สรุปเนื้อหาจากไฟล์ที่เลือก',
    listTitle: 'สรุปที่มีอยู่แล้ว',
    empty: 'ยังไม่มีสรุปในวิชานี้',
    badge: 'AI สรุปให้'
  },
  quiz: {
    idle: 'เลือกเอกสารทางซ้ายเพื่อเริ่มสร้าง Quiz',
    busy: 'AI กำลังออกข้อสอบ... (อาจใช้เวลาสักครู่)',
    action: ' สร้าง Quiz จากไฟล์ที่เลือก',
    listTitle: 'Quiz ที่มีอยู่แล้ว',
    empty: 'ยังไม่มี Quiz ในวิชานี้',
    badge: 'AI ออกข้อสอบให้'
  },
  flashcard: {
    idle: 'เลือกเอกสารทางซ้ายเพื่อเริ่มสร้าง Flashcard',
    busy: 'AI กำลังทำ Flashcard... (อาจใช้เวลาสักครู่)',
    action: ' สร้าง Flashcard จากไฟล์ที่เลือก',
    listTitle: 'Flashcard ที่มีอยู่แล้ว',
    empty: 'ยังไม่มี Flashcard ในวิชานี้',
    badge: 'AI ทำ Flashcard ให้'
  }
}
const studioCopy = computed(() => STUDIO_COPY[activeStudioTab.value])

const isBusyOnTab = computed(
  () =>
    ({ summary: isGenerating.value, quiz: isGeneratingQuiz.value, flashcard: isGeneratingFlashcard.value })[
      activeStudioTab.value
    ]
)

const isLoadingItems = computed(
  () =>
    ({ summary: isLoadingSummaries.value, quiz: isLoadingQuizzes.value, flashcard: isLoadingFlashcardSets.value })[
      activeStudioTab.value
    ]
)

function stepActiveCount(delta) {
  if (activeStudioTab.value === 'quiz') stepCount(quizQuestionCount, delta, QUIZ_LIMITS)
  else stepCount(flashcardCardCount, delta, FLASHCARD_LIMITS)
}

function handleGenerate() {
  if (activeStudioTab.value === 'summary') return handleGenerateSummary()
  if (activeStudioTab.value === 'quiz') return handleGenerateQuiz()
  return handleGenerateFlashcard()
}

// รายการเนื้อหาของแท็บที่เปิดอยู่ (หน้าตาการ์ดเหมือนกันทุกแท็บ)
const studioItems = computed(() => {
  const tab = activeStudioTab.value
  if (tab === 'summary') {
    return summaries.value.map((s) => ({
      key: `summary:${s.summary_id}`,
      kind: 'summary',
      id: s.summary_id,
      title: summaryTitle(s.content),
      files: s.file_names,
      meta: formatDate(s.created_at),
      open: { name: 'summary-detail', params: { summaryId: s.summary_id } },
      actions: []
    }))
  }
  if (tab === 'quiz') {
    return quizzes.value.map((q) => ({
      key: `quiz:${q.quiz_id}`,
      kind: 'quiz',
      id: q.quiz_id,
      title: q.title,
      files: q.file_names,
      meta: `${q.question_count} ข้อ · ${formatDate(q.created_at)}`,
      open: null,
      actions: [
        { label: 'ทำข้อสอบ', primary: true, to: { name: 'quiz-practice', params: { quizId: q.quiz_id } } },
        { label: 'ตรวจสอบ/แก้ไข', to: { name: 'quiz-detail', params: { quizId: q.quiz_id } } }
      ]
    }))
  }
  return flashcardSets.value.map((f) => ({
    key: `flashcard_set:${f.flashcard_set_id}`,
    kind: 'flashcard_set',
    id: f.flashcard_set_id,
    title: f.title,
    files: f.file_names,
    meta: `${f.card_count} ใบ · ${formatDate(f.created_at)}`,
    open: { name: 'flashcard-set-detail', params: { flashcardSetId: f.flashcard_set_id } },
    actions: []
  }))
})

const KIND_CLASS = { PDF: 'kind-pdf', Word: 'kind-word', PowerPoint: 'kind-ppt' }
</script>

<template>
  <div class="page">
    <RouterLink :to="{ name: 'subjects' }" class="back-link">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      วิชาของฉัน
    </RouterLink>

    <p v-if="errorMessage" class="state-box is-error" role="alert">{{ errorMessage }}</p>
    <p v-if="isLoadingSubject" class="state-box">กำลังโหลด...</p>

    <template v-else-if="subject">
      <!-- ============ หัวหน้า: ชื่อวิชา + สถิติ + อัปโหลด ============ -->
      <header
        class="hero"
        :class="{ 'is-dragging': isDragging }"
        :style="subjectColorStyle"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
      >
        <div class="hero-top">
          <div class="hero-title">
            <span class="hero-mark" aria-hidden="true">{{ subjectInitial }}</span>
            <div class="hero-text">
              <p class="eyebrow">รายวิชา</p>
              <h1>{{ subject.name }}</h1>
            </div>
          </div>

          <div class="upload-block">
            <input
              ref="fileInput"
              type="file"
              accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              hidden
              @change="handleFileSelect"
            />
            <button type="button" class="btn-primary" :disabled="isUploading" @click="openFilePicker">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14" />
              </svg>
              {{ isUploading ? 'กำลังอัปโหลด...' : 'อัปโหลดเอกสาร' }}
            </button>
            <p class="upload-hint">หรือลากไฟล์มาวางที่นี่ · PDF, Word, PowerPoint <span class="size-limit">ไม่เกิน 10MB</span></p>
          </div>
        </div>

        <dl class="stats">
          <div class="stat"><dt>เอกสาร</dt><dd>{{ documents.length }}</dd></div>
          <div class="stat"><dt>สรุป</dt><dd>{{ summaries.length }}</dd></div>
          <div class="stat"><dt>Quiz</dt><dd>{{ quizzes.length }}</dd></div>
          <div class="stat"><dt>ชุดบัตรคำ</dt><dd>{{ flashcardSets.length }}</dd></div>
        </dl>
      </header>

      <!-- ============ รับลิงก์แชร์จากเพื่อน ============ -->
      <section class="import-box" aria-labelledby="import-title">
        <div class="import-head">
          <span class="import-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
              <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
            </svg>
          </span>
          <div>
            <h2 id="import-title" class="import-title">Import</h2>
            <p class="import-sub">วางลิงก์ที่ได้รับ เพื่อดูตัวอย่างก่อน แล้วกด Clone เข้าวิชา "{{ subject.name }}"</p>
          </div>
        </div>
        <div class="import-row">
          <input
            id="share-link-input"
            v-model="shareLinkInput"
            type="text"
            class="import-input"
            :class="{ 'has-error': shareLinkError }"
            placeholder="https://.../share/..."
            aria-label="ลิงก์แชร์จากเพื่อน"
            @input="shareLinkError = ''"
            @keyup.enter="openSharedLink"
          />
          <button type="button" class="btn-secondary" :disabled="!shareLinkInput.trim()" @click="openSharedLink">
            Import & Clone
          </button>
        </div>
        <p v-if="shareLinkError" class="field-error" role="alert">{{ shareLinkError }}</p>
      </section>

      <div class="workspace">
        <!-- ============ ซ้าย: แหล่งเอกสาร ============ -->
        <section class="panel sources-pane" aria-labelledby="sources-title">
          <div class="panel-head">
            <div>
              <h2 id="sources-title" class="panel-title">แหล่งเอกสาร</h2>
              <p class="panel-hint">เลือกได้หลายไฟล์ เพื่อรวมเป็นสรุปเดียวกัน</p>
            </div>
            <button
              v-if="documents.length > 1"
              type="button"
              class="link-btn"
              @click="toggleSelectAll"
            >
              {{ allSelected ? 'ล้างที่เลือก' : 'เลือกทั้งหมด' }}
            </button>
          </div>

          <p v-if="isLoadingDocuments" class="muted-text">กำลังโหลดเอกสาร...</p>
          <div v-else-if="documents.length === 0" class="empty-state">
            <span class="empty-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5M9 13h6M9 17h6" />
              </svg>
            </span>
            <p class="empty-title">ยังไม่มีเอกสารในวิชานี้</p>
            <p class="empty-sub">อัปโหลดไฟล์แรกได้เลย แล้วให้ AI ช่วยสรุปและออกข้อสอบ</p>
            <button type="button" class="btn-secondary" :disabled="isUploading" @click="openFilePicker">+ อัปโหลดเอกสาร</button>
          </div>

          <ul v-else class="source-list">
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
                <span class="kind-tile" :class="KIND_CLASS[fileKind(doc.file_name)]" aria-hidden="true">
                  {{ fileKind(doc.file_name) === 'PowerPoint' ? 'PPT' : fileKind(doc.file_name) === 'Word' ? 'DOC' : fileKind(doc.file_name) === 'PDF' ? 'PDF' : 'FILE' }}
                </span>
                <span class="source-info">
                  <span class="source-name" :title="doc.file_name">{{ doc.file_name }}</span>
                  <span class="source-meta">
                    <span class="status-badge" :class="'status-' + doc.status">
                      {{ STATUS_LABEL[doc.status] || doc.status }}
                    </span>
                    <span class="source-date">{{ formatDate(doc.uploaded_at) }}</span>
                  </span>
                </span>
                <button
                  type="button"
                  class="btn-danger-ghost"
                  :disabled="deletingDocumentId === doc.document_id"
                  :aria-label="`ลบเอกสาร ${doc.file_name}`"
                  @click.stop.prevent="handleDeleteDocument(doc)"
                >
                  {{ deletingDocumentId === doc.document_id ? '...' : 'ลบ' }}
                </button>
              </label>
            </li>
          </ul>
        </section>

        <!-- ============ ขวา: Studio ============ -->
        <section class="panel studio-pane" aria-labelledby="studio-title">
          <div class="panel-head">
            <h2 id="studio-title" class="panel-title">Studio</h2>
          </div>

          <div class="studio-tabs" role="tablist" aria-label="ประเภทเนื้อหา">
            <button
              v-for="tab in STUDIO_TABS"
              :key="tab.key"
              type="button"
              role="tab"
              class="studio-tab"
              :class="{ 'is-active': activeStudioTab === tab.key }"
              :aria-selected="activeStudioTab === tab.key"
              @click="activeStudioTab = tab.key"
            >
              <span aria-hidden="true">{{ tab.icon }}</span>
              {{ tab.label }}
              <span class="tab-count">{{ tabCount[tab.key] }}</span>
            </button>
          </div>

          <!-- กล่องสร้างเนื้อหา -->
          <div class="generate-box">
            <div class="generate-status">
              <template v-if="selectedCount === 0">{{ studioCopy.idle }}</template>
              <template v-else>
                <span class="selected-pill">เลือกไว้ {{ selectedCount }} ไฟล์</span>
                <span class="selected-names" :title="selectedDocuments.map((d) => d.file_name).join(', ')">
                  {{ selectedDocuments.slice(0, 2).map((d) => d.file_name).join(', ') }}<template v-if="selectedCount > 2"> และอีก {{ selectedCount - 2 }} ไฟล์</template>
                </span>
              </template>
            </div>

            <div v-if="activeStudioTab !== 'summary'" class="count-row">
              <span class="count-label" id="count-label">{{ activeStudioTab === 'quiz' ? 'จำนวนข้อ' : 'จำนวนใบ' }}</span>
              <div class="stepper" role="group" aria-labelledby="count-label">
                <button
                  type="button"
                  class="stepper-btn"
                  aria-label="ลดจำนวน"
                  :disabled="isBusyOnTab"
                  @click="stepActiveCount(-1)"
                >−</button>
                <input
                  v-if="activeStudioTab === 'quiz'"
                  v-model.number="quizQuestionCount"
                  type="number"
                  min="1"
                  max="30"
                  class="stepper-input"
                  aria-labelledby="count-label"
                />
                <input
                  v-else
                  v-model.number="flashcardCardCount"
                  type="number"
                  min="1"
                  max="40"
                  class="stepper-input"
                  aria-labelledby="count-label"
                />
                <button
                  type="button"
                  class="stepper-btn"
                  aria-label="เพิ่มจำนวน"
                  :disabled="isBusyOnTab"
                  @click="stepActiveCount(1)"
                >+</button>
              </div>
              <span class="count-range">{{ activeStudioTab === 'quiz' ? '1–30 ข้อ' : '1–40 ใบ' }}</span>
            </div>

            <button
              type="button"
              class="btn-primary generate-btn"
              :disabled="selectedCount === 0 || isBusyOnTab"
              @click="handleGenerate"
            >
              {{ isBusyOnTab ? studioCopy.busy : studioCopy.action }}
            </button>

            <div v-if="isBusyOnTab" class="generate-wait" role="status">
              <span class="wait-bar" aria-hidden="true"></span>
              รอ AI มาแล้ว {{ waitSeconds }} วินาที — ปกติใช้ 10–30 วินาที หากเกิน 2 นาทีระบบจะแจ้งให้ลองใหม่
            </div>
          </div>

          <!-- รายการที่มีอยู่แล้ว -->
          <h3 class="sub-title">
            {{ studioCopy.listTitle }}
            <span class="sub-count">{{ tabCount[activeStudioTab] }}</span>
          </h3>

          <p v-if="isLoadingItems" class="muted-text">กำลังโหลด...</p>
          <div v-else-if="studioItems.length === 0" class="empty-state compact">
            <p class="empty-title">{{ studioCopy.empty }}</p>
            <p class="empty-sub">เลือกเอกสารทางซ้าย แล้วกดปุ่มสร้างด้านบน</p>
          </div>

          <ul v-else class="item-list">
            <li v-for="item in studioItems" :key="item.key" class="item-card" :class="'item-' + item.kind">
              <component
                :is="item.open ? RouterLink : 'div'"
                v-bind="item.open ? { to: item.open } : {}"
                class="item-main"
              >
                <span class="ai-badge">{{ studioCopy.badge }}</span>
                <p class="item-title">{{ item.title }}</p>
                <div class="source-files" :title="item.files.join(', ')">
                  <template v-if="item.files.length">
                    <span v-for="n in item.files.slice(0, 2)" :key="n" class="file-chip">📄 {{ n }}</span>
                    <span v-if="item.files.length > 2" class="file-chip">+{{ item.files.length - 2 }} ไฟล์</span>
                  </template>
                  <span v-else class="file-chip is-missing">ไฟล์ต้นทางถูกลบแล้ว</span>
                </div>
                <p class="item-meta">{{ item.meta }}</p>
              </component>

              <div class="item-actions">
                <RouterLink
                  v-for="a in item.actions"
                  :key="a.label"
                  :to="a.to"
                  class="action-link"
                  :class="{ 'is-primary': a.primary }"
                >
                  {{ a.label }}
                </RouterLink>
                <button
                  type="button"
                  class="btn-danger-ghost"
                  :disabled="deletingContentKey === item.key"
                  @click="handleDeleteContent(item.kind, item.id, item.title)"
                >
                  {{ deletingContentKey === item.key ? '...' : 'ลบ' }}
                </button>
              </div>
            </li>
          </ul>
        </section>
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

@media (max-width: 860px) {
  .page { padding: 1.25rem 1rem 3rem; }
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 1.1rem;
  padding: 0.45rem 0.9rem 0.45rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  box-shadow: var(--shadow-card);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
}
.back-link:hover {
  background: var(--hover);
  border-color: var(--primary);
  color: var(--primary);
}
.back-link:hover svg { transform: translateX(-2px); }
.back-link svg { transition: transform 0.15s ease; }

.state-box {
  margin: 0 0 1rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.9rem;
}
.state-box.is-error { border-color: var(--danger); background: var(--danger-bg); color: var(--danger); }

.muted-text { margin: 0.5rem 0; color: var(--text-muted); font-size: 0.9rem; }

/* ---------- ปุ่มพื้นฐาน ---------- */
.btn-primary,
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.7rem 1.3rem;
  border-radius: 12px;
  border: 1px solid transparent;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}
.btn-primary { background: var(--primary); color: var(--on-primary); }
.btn-primary:hover:not(:disabled) { background: var(--primary-strong); }
.btn-secondary { background: var(--surface); border-color: var(--primary); color: var(--primary); }
.btn-secondary:hover:not(:disabled) { background: var(--hover); }
.btn-primary:disabled,
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.link-btn {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--primary);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.link-btn:hover { background: var(--hover); }

.btn-danger-ghost {
  flex: none;
  padding: 0.3rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--danger);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.btn-danger-ghost:hover:not(:disabled) { background: var(--danger-bg); border-color: var(--danger); }
.btn-danger-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

/* ---------- Hero ---------- */
.hero {
  --c: var(--primary);
  margin-bottom: 1.25rem;
  padding: 1.5rem 1.75rem;
  border: 1px solid var(--border);
  border-radius: 20px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--c) 12%, var(--surface)), var(--surface) 60%);
  box-shadow: var(--shadow-card);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.hero.is-dragging { border: 1px dashed var(--primary); box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 18%, transparent); }

.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.hero-title { display: flex; align-items: center; gap: 1rem; min-width: 0; }
.hero-mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--c) 18%, var(--surface));
  color: var(--c);
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
}
.hero-text { min-width: 0; }
.eyebrow { margin: 0 0 0.15rem; color: var(--text-muted); font-size: 0.8rem; }
.hero h1 { margin: 0; font-size: 1.85rem; line-height: 1.25; overflow-wrap: anywhere; }

.upload-block { display: flex; flex-direction: column; align-items: flex-end; gap: 0.45rem; }
.upload-hint { margin: 0; color: var(--text-muted); font-size: 0.78rem; }
.size-limit { color: var(--danger); font-weight: 600; }

.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 1.4rem 0 0;
}
.stat {
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}
.stat dt { color: var(--text-muted); font-size: 0.8rem; }
.stat dd { margin: 0.1rem 0 0; font-family: var(--font-heading); font-size: 1.45rem; font-weight: 700; font-variant-numeric: tabular-nums; }

@media (max-width: 640px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .upload-block { align-items: flex-start; }
}

/* ---------- รับลิงก์จากเพื่อน ---------- */
.import-box {
  margin-bottom: 1.25rem;
  padding: 1rem 1.25rem;
  border: 1px dashed var(--border);
  border-radius: 16px;
  background: var(--surface);
}
.import-head { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.8rem; }
.import-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: var(--info-bg);
  color: var(--info);
}
.import-title { margin: 0; font-size: 0.98rem; }
.import-sub { margin: 0.1rem 0 0; color: var(--text-muted); font-size: 0.82rem; }
.import-row { display: flex; gap: 0.6rem; }
.import-input {
  flex: 1;
  min-width: 0;
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  color: var(--text);
  font-size: 0.92rem;
}
.import-input::placeholder { color: var(--text-muted); }
.import-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent); }
.import-input.has-error { border-color: var(--danger); }
.field-error { margin: 0.5rem 0 0; color: var(--danger); font-size: 0.82rem; }

@media (max-width: 640px) {
  .import-row { flex-direction: column; }
}

/* ---------- 2 คอลัมน์ ---------- */
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 980px) {
  .workspace { grid-template-columns: 1fr; }
}

.panel {
  padding: 1.25rem;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: var(--shadow-card);
}
.panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.9rem; }
.panel-title { margin: 0; font-size: 1.1rem; }
.panel-hint { margin: 0.2rem 0 0; color: var(--text-muted); font-size: 0.82rem; }

/* ---------- แหล่งเอกสาร ---------- */
.source-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.55rem; }
.source-item {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg);
  transition: border-color 0.15s, background 0.15s;
}
.source-item:hover { background: var(--hover); }
.source-item.is-checked { border-color: var(--primary); background: var(--hover); }

.source-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 0.8rem; cursor: pointer; }
.source-checkbox { flex: none; width: 18px; height: 18px; accent-color: var(--primary); cursor: pointer; }

.kind-tile {
  --k: var(--text-muted);
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--k) 16%, var(--surface));
  color: var(--k);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.kind-pdf { --k: var(--primary); }
.kind-word { --k: var(--secondary); }
.kind-ppt { --k: var(--accent); }

.source-info { flex: 1; min-width: 0; display: grid; gap: 0.25rem; }
.source-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.92rem; font-weight: 600; }
.source-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
.source-date { color: var(--text-muted); font-size: 0.78rem; }

.status-badge { padding: 0.1rem 0.55rem; border-radius: 99px; font-size: 0.72rem; font-weight: 600; }
.status-ready { background: var(--success-bg); color: var(--success); }
.status-processing { background: var(--info-bg); color: var(--info); }
.status-failed { background: var(--danger-bg); color: var(--danger); }

/* ---------- Empty state ---------- */
.empty-state {
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  padding: 1.75rem 1rem;
  border: 1px dashed var(--border);
  border-radius: 14px;
  background: var(--bg);
  text-align: center;
}
.empty-state.compact { padding: 1.25rem 1rem; }
.empty-icon { display: grid; place-items: center; color: var(--text-muted); }
.empty-title { margin: 0; font-weight: 600; }
.empty-sub { margin: 0 0 0.4rem; color: var(--text-muted); font-size: 0.84rem; }
.empty-state.compact .empty-sub { margin-bottom: 0; }

/* ---------- Studio ---------- */
.studio-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.25rem;
  margin-bottom: 1rem;
  padding: 0.25rem;
  border-radius: 14px;
  background: var(--bg);
}
.studio-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.55rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.studio-tab:hover { color: var(--text); }
.studio-tab.is-active { border-color: var(--border); background: var(--surface); color: var(--primary); box-shadow: var(--shadow-card); }
.tab-count {
  min-width: 1.4rem;
  padding: 0 0.4rem;
  border-radius: 99px;
  background: var(--hover);
  color: var(--text-muted);
  font-size: 0.72rem;
  line-height: 1.4rem;
  text-align: center;
}
.studio-tab.is-active .tab-count { background: var(--primary); color: var(--on-primary); }

.generate-box {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg);
}
.generate-status { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; color: var(--text-muted); font-size: 0.88rem; }
.selected-pill {
  padding: 0.15rem 0.7rem;
  border-radius: 99px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 0.78rem;
  font-weight: 600;
}
.selected-names { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }

.count-row { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
.count-label { font-size: 0.9rem; font-weight: 600; }
.count-range { color: var(--text-muted); font-size: 0.78rem; }
.stepper { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); overflow: hidden; }
.stepper-btn {
  width: 36px;
  height: 38px;
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 1.15rem;
  cursor: pointer;
}
.stepper-btn:hover:not(:disabled) { background: var(--hover); }
.stepper-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.stepper-input {
  width: 3.2rem;
  height: 38px;
  border: none;
  border-inline: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 600;
  text-align: center;
  appearance: textfield;
  -moz-appearance: textfield;
}
.stepper-input::-webkit-outer-spin-button,
.stepper-input::-webkit-inner-spin-button { appearance: none; margin: 0; }
.stepper-input:focus { outline: none; background: var(--hover); }

.generate-btn { width: 100%; padding: 0.85rem 1.3rem; }

.generate-wait { color: var(--text-muted); font-size: 0.82rem; line-height: 1.6; }
.wait-bar {
  display: block;
  height: 4px;
  margin-bottom: 0.55rem;
  border-radius: 99px;
  background: linear-gradient(90deg, transparent, var(--primary), transparent) 0 0 / 40% 100% no-repeat, var(--border);
  animation: wait-slide 1.4s ease-in-out infinite;
}
@keyframes wait-slide {
  from { background-position: -40% 0, 0 0; }
  to { background-position: 140% 0, 0 0; }
}

.sub-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1.4rem 0 0.7rem;
  font-size: 1rem;
}
.sub-count { padding: 0 0.55rem; border-radius: 99px; background: var(--hover); color: var(--text-muted); font-size: 0.75rem; line-height: 1.4rem; }

/* ---------- การ์ดเนื้อหา ---------- */
.item-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.7rem; }
.item-card {
  --t: var(--primary);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-left: 4px solid var(--t);
  border-radius: 14px;
  background: var(--surface);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.item-card:hover { box-shadow: var(--shadow-lift); }
.item-quiz { --t: var(--secondary); }
.item-flashcard_set { --t: var(--accent); }

.item-main { display: block; padding: 0.9rem 1rem 0.5rem; color: inherit; text-decoration: none; }
.ai-badge {
  display: inline-block;
  margin-bottom: 0.45rem;
  padding: 0.1rem 0.6rem;
  border-radius: 99px;
  background: color-mix(in srgb, var(--t) 16%, var(--surface));
  color: var(--text);
  font-size: 0.72rem;
  font-weight: 600;
}
.item-title { margin: 0 0 0.5rem; font-size: 0.98rem; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
a.item-main:hover .item-title { color: var(--primary); }
.source-files { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.file-chip {
  max-width: 100%;
  padding: 0.1rem 0.6rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-muted);
  font-size: 0.75rem;
}
.file-chip.is-missing { background: var(--warning-bg); color: var(--warning); }
.item-meta { margin: 0.55rem 0 0; color: var(--text-muted); font-size: 0.78rem; }

.item-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 0.5rem; padding: 0.4rem 1rem 0.8rem; }
.action-link {
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
}
.action-link:hover { background: var(--hover); }
.action-link.is-primary { border-color: var(--primary); background: var(--primary); color: var(--on-primary); }
.action-link.is-primary:hover { background: var(--primary-strong); }

@media (prefers-reduced-motion: reduce) {
  .wait-bar { animation: none; }
}
</style>
