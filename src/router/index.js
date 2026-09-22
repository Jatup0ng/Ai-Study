import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/subjects',
    name: 'subjects',
    component: () => import('../views/SubjectListView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/subjects/:id',
    name: 'subject-workspace',
    component: () => import('../views/SubjectWorkspaceView.vue'),
    meta: { requiresAuth: true },
    props: true
  },
  {
    path: '/summaries/:summaryId',
    name: 'summary-detail',
    component: () => import('../views/SummaryDetailView.vue'),
    meta: { requiresAuth: true },
    props: true
  },
  {
    path: '/quizzes/:quizId',
    name: 'quiz-detail',
    component: () => import('../views/QuizDetailView.vue'),
    meta: { requiresAuth: true },
    props: true
  },
  {
    path: '/share/:token',
    name: 'share-preview',
    component: () => import('../views/SharePreviewView.vue'),
    meta: { requiresAuth: false }, // ต้องเปิดให้คนไม่ Login เข้าดู Preview ได้ (BR-11)
    props: true
  },
  {
    // Fallback: unknown paths go to the main app entry point
    path: '/',
    redirect: '/subjects'
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/subjects'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Wait for the initial Supabase session check before deciding
// whether a route is allowed — otherwise a page refresh briefly
// looks "logged out" and bounces the user to /login incorrectly.
function waitForAuthReady(authReady) {
  if (authReady.value) return Promise.resolve()
  return new Promise((resolve) => {
    const stop = setInterval(() => {
      if (authReady.value) {
        clearInterval(stop)
        resolve()
      }
    }, 20)
  })
}

router.beforeEach(async (to) => {
  const { user, authReady } = useAuth()
  await waitForAuthReady(authReady)

  const isLoggedIn = !!user.value
  const requiresAuth = to.meta.requiresAuth !== false

  if (requiresAuth && !isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Logged-in users shouldn't sit on the login page
  if (to.name === 'login' && isLoggedIn) {
    return { name: 'subjects' }
  }

  return true
})

export default router