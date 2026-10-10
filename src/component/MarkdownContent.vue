<script setup>
// ตัวแสดงผล Markdown + สูตรคณิต (KaTeX) แบบปลอดภัย (sanitize ด้วย DOMPurify)
// ใช้แทนการแสดงข้อความดิบ {{ content }} — เนื้อหาเก็บใน DB เป็น Markdown ตามเดิม ไม่ต้อง migrate
import { computed } from 'vue'
import { Marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'

const props = defineProps({
  source: { type: String, default: '' },
  // true = ขึ้นบรรทัดใหม่ตามที่พิมพ์ (เหมาะกับแชท) / false = ตามกฎ Markdown ปกติ (เหมาะกับสรุป)
  breaks: { type: Boolean, default: false },
  // true = แสดงแบบ inline (<span>, ไม่มี <p>/<h1>) สำหรับข้อความสั้นในควิส/แฟลชการ์ด — ไม่ทำให้เลย์เอาต์เดิมพัง
  inline: { type: Boolean, default: false }
})

const md = new Marked({ gfm: true })
// nonStandard: true จำเป็นกับภาษาไทย เพราะไทยไม่เว้นวรรค เช่น "ค่า$x$คือ" ต้องยังจับเป็นสูตรได้
md.use(markedKatex({ throwOnError: false, nonStandard: true }))

// ลิงก์ในเนื้อหาให้เปิดแท็บใหม่ + กัน window.opener
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

// Gemini บางครั้งตอบสูตรแบบ \( ... \) หรือ \[ ... \] — แปลงเป็น $...$ / $$...$$ ให้ตัวแปลงเข้าใจ
function normalizeMath(text) {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m.trim()}$`)
}

// Gemini บางครั้งเอาคำสั่ง/โค้ด (เช่น SQL, ชื่อคอลัมน์) ไปครอบเป็น $\text{...}$ — แต่ใน \text{} ตัว _ % # &
// เป็นตัวอักษรต้องห้ามของ KaTeX (เช่น \text{col_name} ทำให้ parse พังและโชว์เป็นข้อความสีแดง)
// จึง escape ให้ก่อน (ตัวที่ escape ไว้แล้วจะไม่ถูกแตะ) — ตัว _ ในสูตรปกติ เช่น $x_1$ ไม่ได้อยู่ใน \text{} จึงไม่กระทบ
function fixTextMode(text) {
  return text.replace(/\\text\{([^{}]*)\}/g, (_, inner) =>
    '\\text{' + inner.replace(/(?<!\\)([_%#&])/g, '\\$1') + '}'
  )
}

// Gemini บางครั้งเขียนเซ็ตเป็น \hline{a, b\} แทน \{a, b\} — \hline ใช้ได้แค่ในตาราง ถ้าตามด้วย { ตรง ๆ
// แปลว่าตั้งใจจะเขียนปีกกาเซ็ต (ไม่งั้น KaTeX parse พังและโชว์ข้อความสีแดง)
function fixHline(text) {
  return text.replace(/\\hline\s*\{/g, '\\{')
}

// Gemini บางครั้งเขียน \text{INSERT} โดด ๆ ไม่มี $ ครอบ — KaTeX เลยไม่ถูกเรียกและโชว์เป็นข้อความดิบ "\text{INSERT}"
// เจอบ่อยกับคำสั่ง SQL/ชื่อคำศัพท์ในแฟลชการ์ด จึงแปลงเฉพาะที่อยู่นอกสูตร ($...$ / $$...$$) ให้เป็นโค้ดสั้น ๆ `INSERT`
function fixBareText(text) {
  return text
    .split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g) // ตำแหน่งคี่ = ช่วงสูตรที่ห้ามแตะ
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\\text\{([^{}]*)\}/g, (_, inner) => '`' + inner + '`')))
    .join('')
}

const html = computed(() => {
  const text = fixTextMode(fixBareText(normalizeMath(fixHline(props.source || ''))))
  const raw = props.inline
    ? md.parseInline(text, { breaks: props.breaks })
    : md.parse(text, { breaks: props.breaks })
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true, svg: true, mathMl: true } })
})
</script>

<template>
  <span v-if="inline" class="md md-inline" v-html="html"></span>
  <div v-else class="md" v-html="html"></div>
</template>

<style scoped>
/* หน้าตาแบบ "ชีทสรุปสอบ": หัวข้อเด่น, คำสำคัญไฮไลต์, กล่องข้อควรจำ, สูตรเป็นการ์ด */
.md { line-height: 1.9; word-break: break-word; color: var(--text); }
.md :deep(> :first-child) { margin-top: 0; }
.md :deep(> :last-child) { margin-bottom: 0; }

.md :deep(h1), .md :deep(h2), .md :deep(h3), .md :deep(h4) {
  font-family: var(--font-heading);
  line-height: 1.4;
}
.md :deep(h1) {
  font-size: 1.55rem;
  margin: 0 0 0.8rem;
  padding-bottom: 0.6rem;
  border-bottom: 3px solid var(--primary);
}
.md :deep(h2) {
  font-family: var(--font-serif);
  font-size: 1.3rem;
  margin: 2.2rem 0 0.8rem;
  padding: 0 0 0.45rem;
  border-bottom: 1px solid var(--border);
  scroll-margin-top: 1.25rem;
}
.md :deep(h3) {
  font-size: 1.05rem;
  margin: 1.4rem 0 0.4rem;
  color: var(--primary);
  scroll-margin-top: 1.25rem;
}
.md :deep(h3::before) { content: '▸ '; color: var(--accent); }
.md :deep(h4) { font-size: 0.95rem; margin: 1rem 0 0.3rem; color: var(--text-muted); }

.md :deep(p) { margin: 0.6em 0; }
.md-inline { line-height: inherit; }

/* สูตรที่ KaTeX อ่านไม่ออก — ใช้สีแดงตามธีม (ค่าเริ่มต้นของ KaTeX เป็น #cc0000 ตายตัว) */
.md :deep(.katex-error) { color: var(--danger); }
.md-inline :deep(.katex-display) { margin: 0.5rem 0; padding: 0.4rem 0.6rem; }

/* ตัวหนา = คำสำคัญ — ไฮไลต์ฟ้าอ่อนแบบปากกาเน้นข้อความ อ่านง่ายทั้งโหมดสว่างและมืด
   (เดิมใช้สีเหลือง/น้ำตาลของ warning ซึ่งในโหมดมืดออกมาหม่นและตัวหนังสือจมไปกับพื้น) */
.md :deep(strong) {
  font-weight: 700;
  color: var(--text);
  background: linear-gradient(transparent 58%, color-mix(in srgb, var(--primary) 32%, transparent) 58%);
  border-radius: 2px;
  padding: 0 0.15em;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

/* ป้ายหัวกล่อง เช่น "นิยาม:" "ทฤษฎีบท:" — เป็นป้ายสีทึบ ตัวหนังสือชัด แยกจากไฮไลต์คำสำคัญ */
.md :deep(blockquote strong:first-child),
.md :deep(blockquote p > strong:first-child) {
  display: inline-block;
  background: var(--primary);
  color: var(--on-primary);
  padding: 0.02em 0.65em;
  margin-right: 0.35em;
  border-radius: 999px;
  font-size: 0.88em;
  line-height: 1.6;
}

.md :deep(ul), .md :deep(ol) { padding-left: 1.5rem; margin: 0.5em 0; }
.md :deep(li) { margin: 0.3em 0; }
.md :deep(ul > li)::marker { color: var(--primary); }
.md :deep(ol > li)::marker { color: var(--primary); font-weight: 700; }
.md :deep(li > ul), .md :deep(li > ol) { margin: 0.2em 0; }

.md :deep(hr) { border: none; border-top: 1px dashed var(--border-strong); margin: 1.75rem 0; }

/* blockquote = กล่องคำนิยาม / ข้อควรจำ */
.md :deep(blockquote) {
  margin: 1rem 0;
  padding: 0.8rem 1.1rem;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
}
.md :deep(blockquote p) { margin: 0.3em 0; }

.md :deep(code) {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.88em;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.05em 0.35em;
}
.md :deep(pre) {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.8rem 1rem;
  overflow-x: auto;
}
.md :deep(pre code) { background: none; border: none; padding: 0; }

.md :deep(table) {
  border-collapse: collapse;
  margin: 1rem 0;
  display: block;
  overflow-x: auto;
  max-width: 100%;
  font-size: 0.92rem;
}
.md :deep(th), .md :deep(td) { border: 1px solid var(--border-strong); padding: 0.5rem 0.8rem; text-align: left; }
.md :deep(th) { background: var(--hover); color: var(--text); font-weight: 600; }
.md :deep(tr:nth-child(even) td) { background: color-mix(in srgb, var(--hover) 45%, transparent); }

/* สูตรสำคัญ (บรรทัดแยก) เป็นการ์ดกลางหน้า */
.md :deep(.katex-display) {
  margin: 1rem 0;
  padding: 0.8rem 1rem;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow-x: auto;
  overflow-y: hidden;
}
</style>