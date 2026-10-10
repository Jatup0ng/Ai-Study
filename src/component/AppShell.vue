<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useTheme } from '../composables/useTheme'

const router = useRouter()
const { user, signOut } = useAuth()
const { theme, setTheme } = useTheme()

const displayName = computed(() => {
  const meta = user.value?.user_metadata || {}
  return meta.full_name || meta.name || user.value?.email?.split('@')[0] || 'ผู้ใช้'
})
const avatarUrl = computed(() => user.value?.user_metadata?.avatar_url || '')
const initial = computed(() => displayName.value.charAt(0).toUpperCase())

async function handleSignOut() {
  await signOut()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <RouterLink :to="{ name: 'subjects' }" class="brand">
        <span class="brand-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M4 5h6a3 3 0 0 1 3 3v11a3 3 0 0 0-3-3H4zM20 5h-6a3 3 0 0 0-3 3" />
          </svg>
        </span>
        <span class="brand-name">AI Study</span>
      </RouterLink>

      <nav class="nav" aria-label="เมนูหลัก">
        <RouterLink :to="{ name: 'subjects' }" class="nav-item" active-class="is-active">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="M4 5h6a3 3 0 0 1 3 3v11a3 3 0 0 0-3-3H4zM20 5h-6a3 3 0 0 0-3 3" />
          </svg>
          วิชาของฉัน
        </RouterLink>
      </nav>

      <div class="sidebar-bottom">
        <div class="theme-switch" role="group" aria-label="โหมดสี">
          <button
            type="button"
            class="theme-opt"
            :class="{ 'is-on': theme === 'light' }"
            :aria-pressed="theme === 'light'"
            @click="setTheme('light')"
          >
            สว่าง
          </button>
          <button
            type="button"
            class="theme-opt"
            :class="{ 'is-on': theme === 'dark' }"
            :aria-pressed="theme === 'dark'"
            @click="setTheme('dark')"
          >
            มืด
          </button>
        </div>

        <div class="user-card">
          <img v-if="avatarUrl" :src="avatarUrl" alt="" class="avatar" referrerpolicy="no-referrer" />
          <span v-else class="avatar avatar-fallback" aria-hidden="true">{{ initial }}</span>
          <div class="user-meta">
            <div class="user-name">{{ displayName }}</div>
            <button type="button" class="signout" @click="handleSignOut">ออกจากระบบ</button>
          </div>
        </div>
      </div>
    </aside>

    <main class="content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  width: 240px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  padding: 1.5rem 1rem;
  background: var(--surface);
  border-right: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 0.4rem;
  color: var(--text);
  text-decoration: none;
}

.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--hover);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-name {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.05rem;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.85rem;
  border-radius: 10px;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.95rem;
}

.nav-item:hover {
  background: var(--hover);
}

.nav-item.is-active {
  background: var(--hover);
  color: var(--primary);
  font-weight: 600;
}

.sidebar-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.theme-switch {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 12px;
  background: var(--hover);
}

.theme-opt {
  flex: 1;
  border: 0;
  border-radius: 9px;
  padding: 0.45rem 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.85rem;
  cursor: pointer;
}

.theme-opt.is-on {
  background: var(--surface);
  color: var(--primary);
  font-weight: 600;
  box-shadow: var(--shadow-card);
}

.user-card {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem;
  border-radius: 12px;
  background: var(--hover);
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
}

.avatar-fallback {
  background: var(--primary);
  color: var(--on-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.user-meta {
  min-width: 0;
}

.user-name {
  font-size: 0.9rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signout {
  border: 0;
  background: none;
  padding: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
  cursor: pointer;
  text-decoration: underline;
}

.content {
  flex: 1;
  min-width: 0;
}

@media (max-width: 860px) {
  .shell {
    flex-direction: column;
  }
  .sidebar {
    position: static;
    height: auto;
    width: 100%;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  .sidebar-bottom {
    margin: 0 0 0 auto;
    flex-direction: row;
    align-items: center;
  }
}
</style>
