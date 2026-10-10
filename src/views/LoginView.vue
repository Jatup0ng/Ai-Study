<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { toast } from '../composables/useDialog'

const route = useRoute()
const { signInWithGoogle } = useAuth()
const isLoading = ref(false)

async function handleGoogleLogin() {
  isLoading.value = true
  try {
    const redirectPath = typeof route.query.redirect === 'string' ? route.query.redirect : '/subjects'
    await signInWithGoogle(redirectPath)
  } catch (err) {
    toast.error('ลองอีกครั้งได้เลยครับ', { title: 'เข้าสู่ระบบไม่สำเร็จ' })
    isLoading.value = false
  }
}

// จุดเด่นของแอป — แสดงในฝั่งซ้าย (ไอคอนเป็น SVG ทั้งหมด ไม่ใช้ Emoji)
const features = [
  { title: 'สรุปเนื้อหาอัตโนมัติ', desc: 'อัปโหลด PDF, Word หรือ PowerPoint แล้วได้ชีทสรุปพร้อมอ่านทันที', icon: 'summary' },
  { title: 'Quiz และบัตรคำ', desc: 'AI ออกข้อสอบพร้อมเฉลยและสร้างแฟลชการ์ดให้ทบทวนก่อนสอบ', icon: 'quiz' },
  { title: 'แชร์ให้เพื่อน', desc: 'ส่งลิงก์ให้เพื่อนดูตัวอย่าง แล้ว Import เข้าวิชาของตัวเองได้เลย', icon: 'share' }
]
</script>

<template>
  <div class="login-page">
    <div class="blob blob-a" aria-hidden="true"></div>
    <div class="blob blob-b" aria-hidden="true"></div>

    <div class="login-shell">
      <!-- ฝั่งซ้าย: แนะนำแอป -->
      <section class="intro" aria-label="เกี่ยวกับ AI Study Community">
        <div class="intro-brand">
          <span class="intro-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 5h6a3 3 0 0 1 3 3v11a3 3 0 0 0-3-3H4zM20 5h-6a3 3 0 0 0-3 3" />
            </svg>
          </span>
          <span class="intro-name">AI Study</span>
        </div>

        <h2 class="intro-headline">เตรียมสอบให้ง่ายขึ้น<br />ด้วยเพื่อนร่วมเรียนที่เป็น AI</h2>

        <ul class="feature-list">
          <li v-for="f in features" :key="f.title" class="feature">
            <span class="feature-icon" aria-hidden="true">
              <svg v-if="f.icon === 'summary'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5M9 13h6M9 17h6" />
              </svg>
              <svg v-else-if="f.icon === 'quiz'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.25c-.74.37-1.1.95-1.1 1.75M12 17h.01" />
              </svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4" />
              </svg>
            </span>
            <span class="feature-text">
              <span class="feature-title">{{ f.title }}</span>
              <span class="feature-desc">{{ f.desc }}</span>
            </span>
          </li>
        </ul>
      </section>

      <!-- ฝั่งขวา: การ์ดเข้าสู่ระบบ -->
      <section class="login-card" aria-labelledby="login-title">
        <span class="mark" aria-hidden="true">AI</span>
        <h1 id="login-title" class="login-title">AI Study Community</h1>
        <p class="login-subtitle">อัปโหลดเอกสาร ให้ AI ช่วยสรุปและสร้างข้อสอบทบทวนก่อนสอบ</p>

        <button class="google-btn" :disabled="isLoading" @click="handleGoogleLogin">
          <span v-if="isLoading" class="spinner" aria-hidden="true"></span>
          <svg v-else width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          <span>{{ isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google' }}</span>
        </button>

        <p class="login-note">ใช้บัญชี Google ของคุณ ไม่ต้องจำรหัสผ่านเพิ่ม</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  overflow: hidden;
  background:
    radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 60%),
    radial-gradient(900px 500px at 100% 110%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 60%),
    var(--bg);
}

/* ลูกบอลสีเบลอ ๆ เป็นฉากหลัง */
.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.45;
  pointer-events: none;
  animation: float 14s ease-in-out infinite;
}
.blob-a {
  width: 320px;
  height: 320px;
  top: -80px;
  right: 8%;
  background: var(--secondary);
}
.blob-b {
  width: 280px;
  height: 280px;
  bottom: -90px;
  left: 6%;
  background: var(--accent);
  animation-delay: -6s;
}
@keyframes float {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(18px, -22px); }
}

.login-shell {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 940px;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  align-items: center;
  gap: 3rem;
}

/* ---------- ฝั่งซ้าย ---------- */
.intro-brand {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-bottom: 1.75rem;
}
.intro-mark {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  color: var(--on-primary);
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  box-shadow: var(--shadow-lift);
}
.intro-name {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.15rem;
  color: var(--text);
}
.intro-headline {
  margin: 0 0 2rem;
  font-size: 2rem;
  line-height: 1.4;
  color: var(--text);
}

.feature-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}
.feature {
  display: flex;
  align-items: flex-start;
  gap: 0.9rem;
}
.feature-icon {
  flex: none;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--primary);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}
.feature-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.feature-title {
  font-weight: 600;
  color: var(--text);
}
.feature-desc {
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--text-muted);
}

/* ---------- การ์ดล็อกอิน ---------- */
.login-card {
  width: 100%;
  max-width: 400px;
  justify-self: center;
  padding: 2.75rem 2.25rem 2.25rem;
  text-align: center;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  border: 1px solid var(--border);
  border-radius: 24px;
  box-shadow: 0 24px 60px -28px rgba(38, 52, 77, 0.45);
}

.mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  margin-bottom: 1.25rem;
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.15rem;
  color: var(--on-primary);
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  box-shadow: 0 12px 24px -12px var(--primary);
}

.login-title {
  font-size: 1.5rem;
  margin: 0 0 0.5rem;
  color: var(--text);
}
.login-subtitle {
  font-size: 0.92rem;
  color: var(--text-muted);
  margin: 0 0 2rem;
  line-height: 1.7;
}

.google-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  font-size: 0.98rem;
  font-weight: 600;
  font-family: var(--font-body);
  color: var(--text);
  cursor: pointer;
  box-shadow: var(--shadow-card);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.google-btn:hover:not(:disabled) {
  border-color: var(--primary);
  background: var(--hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-lift);
}
.google-btn:active:not(:disabled) {
  transform: translateY(0);
}
.google-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  border-top-color: var(--primary);
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.login-note {
  margin: 1.1rem 0 0;
  font-size: 0.8rem;
  color: var(--text-faint);
}

/* ---------- มือถือ / จอแคบ ---------- */
@media (max-width: 820px) {
  .login-shell {
    grid-template-columns: 1fr;
    gap: 2rem;
    max-width: 440px;
  }
  .intro { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .blob, .spinner { animation: none; }
}
</style>
