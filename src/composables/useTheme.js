import { ref, computed, watch } from 'vue'

const THEME_KEY = 'timeline-theme-preference'

// Shared state (singleton across all component instances)
const themeMode = ref('auto') // 'light' | 'dark' | 'auto'
const systemPrefersDark = ref(false)
let initialized = false

export function useTheme() {
  const isDark = computed(() => {
    if (themeMode.value === 'auto') return systemPrefersDark.value
    return themeMode.value === 'dark'
  })

  function applyTheme() {
    if (isDark.value) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  function setTheme(mode) {
    themeMode.value = mode
    localStorage.setItem(THEME_KEY, mode)
    applyTheme()
  }

  function initTheme() {
    if (initialized) return
    initialized = true

    // Restore from localStorage
    const saved = localStorage.getItem(THEME_KEY)
    if (saved && ['light', 'dark', 'auto'].includes(saved)) {
      themeMode.value = saved
    }

    // Detect system preference
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    systemPrefersDark.value = mq.matches
    mq.addEventListener('change', (e) => {
      systemPrefersDark.value = e.matches
      if (themeMode.value === 'auto') applyTheme()
    })

    applyTheme()
  }

  // Re-apply when themeMode changes
  watch(themeMode, applyTheme)

  return {
    themeMode,
    isDark,
    setTheme,
    initTheme,
  }
}
