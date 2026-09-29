import { useState } from 'react'
import { openExternal } from '../lib/openExternal.js'
import { useStoreValue, widgetDataKey } from '../storage.js'
import { favicon, SHORTCUT_APPS, shortcutFor } from './shortcutApps.js'

// A tiny card that's just an app's icon: click it to open the app in a new
// tab. Made for the leftover slivers of the screen. Settings: { app } for one
// of the presets below, or { url, title } for any other link (shown with the
// site's own icon).
const isSettings = (value) => value && typeof value === 'object'
const NO_SETTINGS = {}

function AppIcon({ app }) {
  const [broken, setBroken] = useState(false)
  if (app.Logo) return <app.Logo />
  return broken ? (
    <span className="shortcut-letter">{app.title.slice(0, 1).toUpperCase()}</span>
  ) : (
    <img src={favicon(app.url)} alt="" onError={() => setBroken(true)} />
  )
}

function Chooser({ onPick }) {
  const [link, setLink] = useState('')
  const [error, setError] = useState('')

  function useLink(event) {
    event.preventDefault()
    try {
      const url = new URL(link.trim().startsWith('http') ? link.trim() : `https://${link.trim()}`)
      onPick({ url: url.href, title: url.hostname.replace(/^www\./, '') })
    } catch {
      setError('That isn’t a link.')
    }
  }

  return (
    <div className="shortcut-chooser">
      <p>Pick an app</p>
      <div className="shortcut-presets">
        {Object.entries(SHORTCUT_APPS).map(([key, app]) => (
          <button key={key} type="button" onClick={() => onPick({ app: key })} title={app.title} aria-label={app.title}>
            <AppIcon app={app} />
          </button>
        ))}
      </div>
      <form onSubmit={useLink}>
        <input
          value={link}
          onChange={(event) => {
            setLink(event.target.value)
            setError('')
          }}
          placeholder="or paste a link"
          aria-label="Link to open"
        />
      </form>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

export default function ShortcutWidget({ id }) {
  const [settings, setSettings] = useStoreValue(widgetDataKey(id), NO_SETTINGS, isSettings)
  const app = shortcutFor(settings)
  if (!app) return <Chooser onPick={setSettings} />
  return (
    <button type="button" className="shortcut" onClick={() => openExternal(app.url)} title={`Open ${app.title} (new tab)`}>
      <span className="shortcut-icon">
        <AppIcon app={app} />
      </span>
      <span className="shortcut-label">{app.title}</span>
    </button>
  )
}
