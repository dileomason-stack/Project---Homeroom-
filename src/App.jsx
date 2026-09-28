import { useEffect, useState } from 'react'
import Dashboard from './Dashboard.jsx'
import Toast from './Toast.jsx'
import DashboardTabs from './DashboardTabs.jsx'
import { exampleSeed } from './example.js'
import { createStore, readJSON, removeKey, StoreContext, useStore, writeJSON } from './storage.js'
import { layoutKeyFor, useDashboards } from './useDashboards.js'
import { copyToOwnDashboards, HAS_OWN_KEY, OWN_PREFIX } from './lib/copyDashboard.js'
import { showToast } from './lib/toast.js'
import { restoreGoogle, useGoogle } from './lib/google.js'
import { restoreMicrosoft } from './lib/microsoft.js'
import { startSync } from './lib/sync.js'

// "own": the visitor's own dashboard, saved in this browser. It's where
//   Homeroom opens for first-time visitors.
// "example": Alex's sample dashboard (memory only, resets on reload), one
//   click away as a tour of what Homeroom can do.
const MODE_KEY = 'dashboard:mode'

// Layouts saved by earlier versions of the app.
removeKey('dashboard:v1')
removeKey('dashboard:v2')
removeKey('dashboard:widget:default-todo')

function storeFor(mode) {
  return mode === 'own' ? createStore({ prefix: OWN_PREFIX }) : createStore({ seed: exampleSeed(), example: true })
}

export default function App() {
  // Each switch creates a fresh store, so the example always starts clean.
  const [store, setStore] = useState(() => {
    const mode = readJSON(MODE_KEY, 'own') === 'example' ? 'example' : 'own'
    if (mode === 'own') writeJSON(HAS_OWN_KEY, true)
    return storeFor(mode)
  })
  // Bumped on every switch so the dashboard starts fresh (no leftover full-screen widget, etc.).
  const [generation, setGeneration] = useState(0)

  // Signed in with Google (from anywhere): your own dashboard saves to your
  // account and loads on other devices. See lib/sync.js.
  const google = useGoogle()
  // Stay signed in to Google across visits (see lib/google.js).
  useEffect(() => {
    restoreGoogle()
    restoreMicrosoft()
  }, [])
  useEffect(() => {
    if (store.example || !google?.accessToken || !google.scopes?.includes('openid')) return
    return startSync({
      store,
      google,
      onReplaced: () => {
        setStore(storeFor('own'))
        setGeneration((count) => count + 1)
        showToast('Loaded your dashboard from your Google account.')
      },
    })
  }, [store, google])

  function switchTo(mode) {
    writeJSON(MODE_KEY, mode)
    if (mode === 'own') writeJSON(HAS_OWN_KEY, true)
    setStore(storeFor(mode))
    setGeneration((count) => count + 1)
    window.scrollTo(0, 0)
  }

  return (
    <StoreContext.Provider value={store}>
      <Toast />
      <DashboardSwitcher
        key={generation}
        hasOwn={readJSON(HAS_OWN_KEY, false)}
        onBuildOwn={() => switchTo('own')}
        onViewExample={() => switchTo('example')}
        onResetExample={() => switchTo('example')}
      />
    </StoreContext.Provider>
  )
}

// Shows the active dashboard, with tabs to switch between dashboards. Each
// switch remounts Dashboard so nothing (like a full-screen card) carries over.
function DashboardSwitcher(props) {
  const store = useStore()
  const dashboards = useDashboards()
  const [editingId, setEditingId] = useState(null)

  // In the example: copy one of Alex's tabs into your own dashboards.
  function copyToMine(item) {
    if (!copyToOwnDashboards(store, item)) return
    showToast(`Copied “${item.name}” to your dashboards.`, 8000, { label: 'See it →', onClick: props.onBuildOwn })
  }
  const onCopy = store.example ? copyToMine : undefined

  // On your own dashboard: add a copy of Alex's 🎮 Fun tab in one click.
  function addGamesTab() {
    const example = createStore({ seed: exampleSeed(), example: true })
    if (copyToOwnDashboards(example, { id: 'fun', name: '🎮 Fun' }, store))
      showToast('Added the 🎮 Fun tab: an arcade, a daily word game and game links.')
  }

  return (
    <Dashboard
      key={dashboards.active.id}
      layoutKey={layoutKeyFor(dashboards.active.id)}
      tabs={<DashboardTabs dashboards={dashboards} editingId={editingId} setEditingId={setEditingId} onCopy={onCopy} />}
      onCopyTab={onCopy && (() => onCopy(dashboards.active))}
      onAddGamesTab={store.example ? undefined : addGamesTab}
      {...props}
    />
  )
}
