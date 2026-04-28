<script setup>
import { useTimelineStore } from "../stores/timelineStore";

const store = useTimelineStore();
</script>

<template>
  <!-- Regular toast -->
  <Transition name="toast">
    <div v-if="store.toastVisible && !store.cacheToastVisible" class="toast">
      {{ store.toastMessage }}
    </div>
  </Transition>

  <!-- Cache restore toast (loading → done, single element, phase via CSS class) -->
  <Transition name="cache-toast">
    <div
      v-if="store.cacheToastVisible"
      class="toast cache-toast"
      :class="'phase-' + store.cacheToastPhase"
      :key="'cache'"
    >
      <div class="cache-icon">
        <!-- DB with layers that draw in one by one (loading: repeating, done: drawn + check) -->
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <ellipse cx="12" cy="5" rx="9" ry="3" class="db-layer layer-1" />
          <path
            d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"
            class="db-layer layer-2"
          />
          <path
            d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"
            class="db-layer layer-3"
          />
        </svg>
        <!-- Checkmark that appears on done -->
        <svg
          v-if="store.cacheToastPhase === 'done'"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          class="check-overlay"
        >
          <path
            d="M7 13l3 3 7-7"
            stroke="var(--accent)"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="check-path"
          />
        </svg>
      </div>

      <div class="cache-text">
        <span class="cache-label">{{ store.cacheToastMessage }}</span>
        <span class="cache-sub">{{ store.cacheToastSub }}</span>
      </div>

      <!-- Bouncing dots during loading -->
      <div
        class="loading-dots"
        :class="{ hidden: store.cacheToastPhase !== 'loading' }"
      >
        <span class="dot d1"></span>
        <span class="dot d2"></span>
        <span class="dot d3"></span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  bottom: 70px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface-overlay);
  color: var(--surface-overlay-text);
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  box-shadow: var(--shadow-lg);
  z-index: 1000;
  pointer-events: none;
  white-space: nowrap;
}

/* Regular toast transitions */
.toast-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.toast-leave-active {
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

/* Cache toast styling */
.cache-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 22px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  overflow: visible;
  transition: background 0.4s ease;
}

.phase-loading {
  background: var(--surface-overlay);
}

.phase-done {
  background: linear-gradient(
    135deg,
    var(--surface-overlay) 0%,
    color-mix(in srgb, var(--accent) 12%, var(--surface-overlay)) 100%
  );
}

/* Icon container */
.cache-icon {
  position: relative;
  color: var(--accent);
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

/* DB layers - loading: repeating draw animation */
.phase-loading .db-layer {
  stroke-dasharray: 60;
  stroke-dashoffset: 60;
  animation: layer-draw-loop 2s ease-in-out infinite;
}

.phase-loading .layer-1 {
  animation-delay: 0s;
}
.phase-loading .layer-2 {
  animation-delay: 0.25s;
}
.phase-loading .layer-3 {
  animation-delay: 0.5s;
}

@keyframes layer-draw-loop {
  0% {
    stroke-dashoffset: 60;
    opacity: 0.3;
  }
  40% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  70% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  100% {
    stroke-dashoffset: 60;
    opacity: 0.3;
  }
}

/* DB layers - done: draw in and stay */
.phase-done .db-layer {
  stroke-dasharray: 60;
  stroke-dashoffset: 60;
  animation: layer-draw-in 0.5s ease-out forwards;
}

.phase-done .layer-1 {
  animation-delay: 0s;
}
.phase-done .layer-2 {
  animation-delay: 0.15s;
}
.phase-done .layer-3 {
  animation-delay: 0.3s;
}

@keyframes layer-draw-in {
  to {
    stroke-dashoffset: 0;
  }
}

/* Checkmark overlay */
.check-overlay {
  position: absolute;
  top: 0;
  left: 0;
}

.check-path {
  stroke-dasharray: 20;
  stroke-dashoffset: 20;
  animation: layer-draw-in 0.35s ease-out 0.55s forwards;
}

/* Text */
.cache-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cache-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  transition: all 0.3s ease;
}

.cache-sub {
  font-size: 10px;
  opacity: 0.6;
  font-weight: 400;
  transition: all 0.3s ease;
}

/* Loading dots */
.loading-dots {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-left: 2px;
  transition: opacity 0.3s ease;
}

.loading-dots.hidden {
  opacity: 0;
  pointer-events: none;
}

.dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
  animation: dot-bounce 1.2s ease-in-out infinite;
}

.d1 {
  animation-delay: 0s;
}
.d2 {
  animation-delay: 0.2s;
}
.d3 {
  animation-delay: 0.4s;
}

@keyframes dot-bounce {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-4px);
  }
}

/* Cache toast enter/leave transitions */
.cache-toast-enter-active {
  transition:
    opacity 0.3s ease,
    transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cache-toast-leave-active {
  transition:
    opacity 0.6s ease,
    transform 0.6s ease;
}
.cache-toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(30px) scale(0.8);
}
.cache-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px) scale(0.95);
}
</style>
