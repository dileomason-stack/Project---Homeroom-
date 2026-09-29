import { useEffect, useRef, useState } from 'react'
import UseBadge from './UseBadge.jsx'
import { WIDGETS } from './widgets/registry.js'

// The "+ Add widget" panel: a search box and the widgets grouped into a few
// sections of tiles, several per row, so everything fits without scrolling.
const GROUPS = [
  ['School', ['canvas', 'calendar', 'todo', 'notes', 'tool', 'googlefile']],
  ['Apps & links', ['search', 'claude', 'chatgpt', 'inbox', 'spotify', 'links', 'shortcut', 'website', 'preview']],
  ['News & sports', ['news', 'scores', 'sleeper']],
  ['Games', ['arcade', 'word', 'g2048', 'snake', 'typing', 'game']],
]
// Any widget type not listed above still shows, at the end.
const listed = new Set(GROUPS.flatMap(([, types]) => types))
const SECTIONS = [...GROUPS, ['More', Object.keys(WIDGETS).filter((type) => !listed.has(type))]]
  .map(([name, types]) => [name, types.filter((type) => WIDGETS[type])])
  .filter(([, types]) => types.length > 0)

const matches = (type, query) => {
  const { title, description } = WIDGETS[type]
  return `${title} ${description}`.toLowerCase().includes(query)
}

// onAddLink: turns a pasted link into the best card for it (see classifyLink).
export default function AddWidgetMenu({ onAdd, onAddLink }) {
  const [open, setOpen] = useState(false)
  const [area, setArea] = useState('workspace')
  const [query, setQuery] = useState('')
  const [link, setLink] = useState('')
  const menuRef = useRef(null)
  const search = query.trim().toLowerCase()
  const sections = SECTIONS.map(([name, types]) => [name, types.filter((type) => matches(type, search))]).filter(
    ([, types]) => types.length > 0,
  )

  function add(type) {
    onAdd(type, area)
    setOpen(false)
    setQuery('')
  }

  // Close when clicking anywhere else or pressing Escape.
  useEffect(() => {
    if (!open) return
    function handleClick(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div className="add-menu" ref={menuRef}>
      <button
        type="button"
        className="primary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        + Add widget
      </button>
      {open && (
        <div className="add-menu-list">
          <div className="segmented" role="radiogroup" aria-label="Add to">
            <span>Add to</span>
            {[
              ['sidebar', 'Sidebar'],
              ['workspace', 'Workspace'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={area === value}
                className={area === value ? 'selected' : undefined}
                onClick={() => setArea(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            className="add-menu-search"
            type="search"
            placeholder="Search widgets…"
            aria-label="Search widgets"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter adds the first match.
              if (event.key === 'Enter' && sections[0]) add(sections[0][1][0])
            }}
            autoFocus
          />
          {onAddLink && (
            <form
              className="add-menu-link"
              onSubmit={(event) => {
                event.preventDefault()
                const url = link.trim()
                if (!/^https?:\/\/\S+$/i.test(url)) return
                onAddLink(url)
                setLink('')
                setOpen(false)
              }}
            >
              <span aria-hidden="true">🔗</span>
              <input
                type="url"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="Or paste any link: YouTube, Spotify, a Google Doc, a website…"
                aria-label="Paste a link to add it as a card"
              />
              <button type="submit" disabled={!/^https?:\/\/\S+$/i.test(link.trim())}>
                Add
              </button>
            </form>
          )}
          <p className="add-menu-key">
            <UseBadge use="live" /> works in the card · <UseBadge use="preview" /> at a glance · <UseBadge use="jump" /> opens in
            a new tab
          </p>
          <div className="add-menu-sections" role="menu">
            {sections.length === 0 && <p className="add-menu-empty">No widgets match “{query}”.</p>}
            {sections.map(([name, types]) => (
              <section key={name}>
                <h3>{name}</h3>
                <div className="add-menu-grid">
                  {types.map((type) => {
                    const widget = WIDGETS[type]
                    const Icon = widget.tab.icon
                    return (
                      <button key={type} type="button" role="menuitem" className="add-tile" onClick={() => add(type)}>
                        <span className="add-tile-top">
                          {Icon && <Icon />}
                          <strong>{widget.title}</strong>
                          <UseBadge use={widget.use} compact />
                        </span>
                        <span className="add-tile-text">{widget.description}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
