import { useCallback, useState } from 'react'
import ColorPicker from './ColorPicker.jsx'
import ContextMenu from './ContextMenu.jsx'
import { isDark, isValidHex } from './lib/colors.js'
import { NOT_DRAGGABLE } from './lib/drag.js'
import { useStoreValue, widgetDataKey } from './storage.js'
import UseBadge from './UseBadge.jsx'

const NO_STYLE = {}
const isStyle = (value) => value && typeof value === 'object'

// Widgets are plain cards: no tab bar or address bar. Options live in a menu
// opened by right-click, double-click, or the ⋯ button that appears on hover.
// The − button (top left, also on hover) collapses the card to a label.
//
// Grab a card anywhere (except buttons, links, text boxes, see NOT_DRAGGABLE)
// to move it. In the workspace the grid library handles that; in the sidebar
// the card becomes an HTML drag (to reorder) when pressed on an empty spot.
// Clicks inside embedded players (Spotify, Google Calendar) go to that site,
// so those cards are grabbed by the strip or ⠿ grip on top.
//
// With `colorable`, the menu has "Card color…" and the chosen background is
// saved under style:<widgetId>.
export default function WidgetCard({
  widgetId,
  type,
  title,
  menuItems,
  colorable,
  getSpotifyEmbedUrl,
  appColor,
  use,
  useFor,
  highlight,
  onCollapse,
  onDragStart,
  onDragEnd,
  children,
}) {
  const [menu, setMenu] = useState(null)
  // Sidebar only: the card is draggable while pressed on an empty spot, so
  // selecting text in its inputs still works.
  const [armed, setArmed] = useState(false)
  const [picker, setPicker] = useState(null)
  const [style, setStyle] = useStoreValue(`style:${widgetId}`, NO_STYLE, isStyle)
  // The badge can depend on the card's settings (see useFor in registry.js).
  const [settings] = useStoreValue(widgetDataKey(widgetId), null)
  const badge = useFor?.(settings) ?? use
  const closeMenu = useCallback(() => setMenu(null), [])
  const closePicker = useCallback(() => setPicker(null), [])

  const color = isValidHex(style.background) ? style.background : null
  const baseItems = menu ? menuItems() : []
  const items = colorable ? [{ label: 'Card color…', onSelect: () => setPicker(menu) }, ...baseItems] : baseItems

  function openMenuAt(event) {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY })
  }

  function handleDoubleClick(event) {
    // Leave double-click alone where it already means something.
    if (event.target.closest('button, a, input, textarea, label, select')) return
    openMenuAt(event)
  }

  return (
    <section
      className={`card card-${type}${color ? (isDark(color) ? ' card-colored card-dark' : ' card-colored card-light') : ''}${highlight ? ' card-new' : ''}`}
      data-widget-id={widgetId}
      style={color ? { '--card-bg': color } : undefined}
      aria-label={title}
      title="Drag to move · Right-click for options"
      onContextMenu={openMenuAt}
      onDoubleClick={handleDoubleClick}
      draggable={armed}
      onMouseDown={(event) => onDragStart && !event.target.closest(NOT_DRAGGABLE) && setArmed(true)}
      onMouseUp={() => setArmed(false)}
      onDragStart={onDragStart}
      onDragEnd={(event) => {
        setArmed(false)
        onDragEnd?.(event)
      }}
    >
      <div className="card-top">
        {onCollapse && (
          <button
            type="button"
            className="card-collapse-button"
            aria-label={`Collapse ${title}`}
            title="Collapse"
            onClick={onCollapse}
          >
            −
          </button>
        )}
        {type !== 'spotify' && (
          <span className="card-title" title={title}>
            {title}
          </span>
        )}
        <UseBadge use={badge} />
        <div className="card-handle">
          <span className="card-grip" aria-hidden="true">
            ⠿
          </span>
          <button
            type="button"
            className="card-menu-button"
            aria-label={`${title} options`}
            aria-haspopup="menu"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setMenu({ x: rect.right - 180, y: rect.bottom + 4 })
            }}
          >
            ⋯
          </button>
        </div>
      </div>
      <div className="card-body">{children}</div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={closeMenu} />}
      {picker && (
        <ColorPicker
          x={picker.x}
          y={picker.y}
          value={color}
          spotifyEmbedUrl={getSpotifyEmbedUrl()}
          appColor={appColor}
          onChange={(next) => setStyle(next ? { background: next } : {})}
          onClose={closePicker}
        />
      )}
    </section>
  )
}
