import { ref } from 'vue'

/**
 * Generic composable for drag-to-reorder in a list.
 * @param {Function} onReorder - callback(fromIdx, toIdx) called on drop
 */
export function useDragReorder(onReorder) {
  const draggedIdx = ref(null)
  const dropTargetIdx = ref(null)

  function onDragStart(idx, event) {
    draggedIdx.value = idx
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', idx.toString())
    // Reduce opacity of dragged element
    if (event.target) {
      event.target.style.opacity = '0.5'
    }
  }

  function onDragOver(idx, event) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    dropTargetIdx.value = idx
  }

  function onDrop(idx, event) {
    event.preventDefault()
    if (draggedIdx.value !== null && draggedIdx.value !== idx) {
      onReorder(draggedIdx.value, idx)
    }
    draggedIdx.value = null
    dropTargetIdx.value = null
  }

  function onDragEnd(event) {
    if (event.target) {
      event.target.style.opacity = ''
    }
    draggedIdx.value = null
    dropTargetIdx.value = null
  }

  return { draggedIdx, dropTargetIdx, onDragStart, onDragOver, onDrop, onDragEnd }
}
