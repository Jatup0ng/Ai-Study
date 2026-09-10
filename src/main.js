import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// --------------------------------------------------------------
// Error Boundary ระดับแอป — ถ้าเกิด Error ตอน Mount หรือระหว่าง
// ทำงาน จะโชว์ข้อความบนหน้าจอแทนที่จะปล่อยให้ค้างเป็นจอขาวเงียบๆ
// (ก่อนหน้านี้เจอปัญหาจอขาวโดยไม่มีเบาะแส debug ได้ยาก จึงเพิ่ม
// จุดนี้ไว้ถาวรกันปัญหาแบบเดิมเกิดซ้ำแบบไม่รู้สาเหตุ)
// --------------------------------------------------------------
function renderFatalError(err) {
  const appEl = document.getElementById('app')
  if (!appEl) return
  const message = err?.message || String(err)
  const stack = err?.stack || ''
  appEl.innerHTML = `
    <div style="max-width:640px;margin:3rem auto;padding:1.5rem;
      font-family:system-ui,sans-serif;border:1px solid #f0c4c4;
      border-radius:12px;background:#fdecec;color:#1a1a1a;">
      <h2 style="margin-top:0;color:#c0392b;">เกิดข้อผิดพลาดตอนโหลดแอป</h2>
      <p style="font-size:0.9rem;line-height:1.6;">
        แอปไม่สามารถเริ่มทำงานได้ ข้อความ Error ด้านล่างนี้คือสาเหตุ —
        ก็อปไปหา AI หรือส่งให้ Claude ดูต่อได้เลย
      </p>
      <pre style="white-space:pre-wrap;background:#fff;padding:0.75rem;
        border-radius:8px;font-size:0.8rem;overflow:auto;">${message}\n\n${stack}</pre>
    </div>
  `
}

window.addEventListener('error', (e) => {
  if (!document.getElementById('app')?.hasChildNodes()) renderFatalError(e.error || e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  if (!document.getElementById('app')?.hasChildNodes()) renderFatalError(e.reason)
})

try {
  const app = createApp(App)
  app.config.errorHandler = (err) => {
    console.error('[Vue Error]', err)
    renderFatalError(err)
  }
  app.use(router).mount('#app')
} catch (err) {
  renderFatalError(err)
}
