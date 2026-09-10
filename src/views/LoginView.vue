<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const { signInWithGoogle } = useAuth()
const isLoading = ref(false)
const errorMessage = ref('')

async function handleGoogleLogin() {
  errorMessage.value = ''
  isLoading.value = true
  try {
    const redirectPath = typeof route.query.redirect === 'string' ? route.query.redirect : '/subjects'
    await signInWithGoogle(redirectPath)
  } catch (err) {
    errorMessage.value = 'เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้งได้เลยครับ'
    isLoading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <span class="mark">AI</span>
      <h1 class="login-title">AI Study Community</h1>
      <p class="login-subtitle">อัปโหลดเอกสาร ให้ AI ช่วยสรุปและสร้างข้อสอบทบทวนก่อนสอบ</p>

      <button class="google-btn" :disabled="isLoading" @click="handleGoogleLogin">
        {{ isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google' }}
      </button>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--paper);
  padding: 1rem;
}

.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2.75rem 2rem;
  text-align: center;
}

.mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--highlighter-soft);
  border: 1px solid var(--highlighter);
  color: #8a6d1a;
  font-family: var(--font-heading);
  font-weight: 700;
  margin-bottom: 1.25rem;
}

.login-title {
  font-size: 1.4rem;
  margin: 0 0 0.5rem;
  color: var(--ink);
}

.login-subtitle {
  font-size: 0.88rem;
  color: var(--ink-soft);
  margin: 0 0 2rem;
  line-height: 1.6;
}

.google-btn {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: #ffffff;
  font-size: 0.95rem;
  font-weight: 600;
  font-family: var(--font-body);
  color: var(--ink);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.google-btn:hover:not(:disabled) {
  background: var(--paper);
  border-color: var(--ink-faint);
}

.google-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-text {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: var(--danger);
}
</style>
