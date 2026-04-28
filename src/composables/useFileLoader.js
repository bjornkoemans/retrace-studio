import { useTimelineStore } from '../stores/timelineStore'

export function useFileLoader() {
  const store = useTimelineStore()

  async function handleFolderInput(event) {
    const files = Array.from(event.target.files)
    if (files.length === 0) return

    const parts = files[0].webkitRelativePath.split('/')
    const folderName = parts[0] || 'unknown'

    const logCsvs = files
      .filter((f) => {
        const p = f.webkitRelativePath.split('/')
        return f.name.endsWith('.csv') && p.some((s) => s === 'logs')
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    if (logCsvs.length === 0) {
      alert(
        'No log CSV files found.\nMake sure the folder contains a logs/ subfolder with log_*.csv files.'
      )
      return
    }

    const logFiles = {}
    for (const file of logCsvs) {
      logFiles[file.name] = await file.text()
    }

    const summaryFile = files.find((f) => f.name === 'training_summary.txt')
    let episodeRewards = {}
    let evalRewards = {}
    if (summaryFile) {
      const text = await summaryFile.text()
      const epMatches = text.matchAll(/Episode (\d+): (-?[\d.]+)/g)
      for (const m of epMatches) episodeRewards[parseInt(m[1])] = parseFloat(m[2])
      const evMatches = text.matchAll(/Eval (\d+): (-?[\d.]+)/g)
      for (const m of evMatches) evalRewards[parseInt(m[1])] = parseFloat(m[2])
    }

    const folder = {
      name: folderName,
      logFiles,
      logNames: logCsvs.map((f) => f.name),
      episodeRewards,
      evalRewards,
    }
    store.loadedFolders.push(folder)
    store.selectedFolderIdx = store.loadedFolders.length - 1

    // Reset file input so the same folder can be re-selected
    event.target.value = ''
  }

  return { handleFolderInput }
}
