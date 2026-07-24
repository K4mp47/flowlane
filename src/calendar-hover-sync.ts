function getTaskKey(element: Element | null) {
  if (!(element instanceof HTMLElement)) return null
  const task = element.closest<HTMLElement>('.calendar-range-task')
  const reference = task?.querySelector<HTMLElement>('.calendar-range-ref')?.textContent?.trim()
  return reference || null
}

function setHoveredTask(key: string | null) {
  document.querySelectorAll<HTMLElement>('.calendar-range-task').forEach((task) => {
    const reference = task.querySelector<HTMLElement>('.calendar-range-ref')?.textContent?.trim()
    task.dataset.hovered = key && reference === key ? 'true' : 'false'
  })
}

document.addEventListener('pointerover', (event) => {
  const key = getTaskKey(event.target as Element | null)
  if (key) setHoveredTask(key)
})

document.addEventListener('pointerout', (event) => {
  const currentKey = getTaskKey(event.target as Element | null)
  if (!currentKey) return

  const nextKey = getTaskKey(event.relatedTarget as Element | null)
  if (nextKey !== currentKey) setHoveredTask(null)
})
