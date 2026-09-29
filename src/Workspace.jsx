import { useCallback, useState } from 'react'
import ContextMenu from './ContextMenu.jsx'
import ReactGridLayout, { bottom, useContainerWidth } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { CARD_TYPE, droppedLink, isCardDrag, NOT_DRAGGABLE } from './lib/drag.js'
import { COLS, createPushDownCompactor, GAP, ROW_HEIGHT } from './lib/grid.js'
import UseBadge from './UseBadge.jsx'
import { WIDGETS } from './widgets/registry.js'
import { SPOTIFY_FILL_HEIGHTS } from './lib/spotifyPlayer.js'

// A Spotify card's top strip (its grab bar), above the player.
const SPOTIFY_BAR = 22

// After resizing a Spotify card, snap it to a height its player fills (see
// SPOTIFY_FILL_HEIGHTS), in the direction it was dragged: even a small drag
// down goes to the next size up, a small drag up to the next size down.
// Taller than the track-list size is fine.
function snappedSpotifyRows(rows, rowsBefore) {
  const space = rows * ROW_HEIGHT - GAP - SPOTIFY_BAR
  if (space >= SPOTIFY_FILL_HEIGHTS.at(-1)) return rows
  const target =
    rows > rowsBefore
      ? (SPOTIFY_FILL_HEIGHTS.find((h) => h >= space) ?? space)
      : rows < rowsBefore
        ? ([...SPOTIFY_FILL_HEIGHTS].reverse().find((h) => h <= space) ?? SPOTIFY_FILL_HEIGHTS[0])
        : SPOTIFY_FILL_HEIGHTS.reduce((best, h) => (Math.abs(h - space) < Math.abs(best - space) ? h : best))
  return Math.ceil((target + GAP + SPOTIFY_BAR) / ROW_HEIGHT)
}

// Saved position + the widget type's min size. A widget with no saved
// position goes at the bottom, and nothing is ever smaller than its minimum.
// Collapsed cards keep their saved (small) size and can't be resized.
function buildLayout(widgets, grid, collapsed) {
  const layout = []
  for (const widget of widgets) {
    const { minW, minH, w, h } = WIDGETS[widget.type].size
    const saved = grid.find((item) => item.i === widget.id)
    const found = saved ?? { i: widget.id, x: 0, y: bottom(layout), w, h }
    const position = { ...found, x: Math.max(0, found.x) }
    if (collapsed.has(widget.id)) {
      layout.push({ ...position, minW: 1, minH: 1, isResizable: false })
      continue
    }
    layout.push({
      ...position,
      w: Math.min(COLS, Math.max(position.w, minW)),
      h: Math.max(position.h, minH),
      minW,
      minH,
      // A Spotify card's top edge is its grab bar, so it moves the card
      // rather than resizing it (Spotify's heights snap anyway).
      ...(widget.type === 'spotify' ? { resizeHandles: ['e', 's', 'w', 'se', 'sw'] } : {}),
    })
  }
  return layout
}

// Keep only the fields worth saving.
const pickPosition = ({ i, x, y, w, h }) => ({ i, x, y, w, h })

// The open area next to the sidebar. Grab a card anywhere (except its buttons,
// links and text boxes) to move it; it stays exactly where it's dropped and
// nothing slides up to fill gaps. Dropping onto another card pushes that card
// down, so cards never hide each other. Resize from any edge or corner.
// onCardDrag / onCardDrop: (id, event) while a card is dragged and when it's
// let go, so a card can be dropped outside the grid (into the sidebar).
export default function Workspace({
  widgets,
  collapsed,
  onCardDrag,
  onCardDrop,
  // (id, cell) when a sidebar card is dropped onto the workspace.
  onDropCard,
  grid,
  onGridChange,
  onAddWidget,
  onDropLink,
  showStarter,
  // Shown at the top of the blank-dashboard starter (e.g. See an example).
  starterActions,
  renderWidget,
  stacked,
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const layout = buildLayout(widgets, grid, collapsed)
  // Created once. It remembers which card is being dragged/resized, since that
  // card wins any overlap.
  const [compactor] = useState(createPushDownCompactor)
  const setActive = (current, item) => compactor.setActive(item?.i ?? null, current)
  // While a card is dragged or resized, embedded sites (a Spotify player right
  // under the grab bar, a whiteboard next to it...) stop catching the mouse,
  // so every movement and the release reach the grid (CSS: .card-dragging).
  // Otherwise the pointer slipping onto a player mid-drag loses the drag.
  const startDragging = (current, item) => {
    setActive(current, item)
    document.documentElement.classList.add('card-dragging')
    window.addEventListener('pointerup', stopDragging, { once: true, capture: true })
  }
  const stopDragging = () => document.documentElement.classList.remove('card-dragging')
  const clearActive = () => {
    compactor.setActive(null)
    stopDragging()
  }

  // The grid cell under a point on screen.
  function cellAt(event) {
    const rect = containerRef.current.getBoundingClientRect()
    const colWidth = (rect.width - GAP) / COLS
    return {
      x: Math.floor((event.clientX - rect.left - GAP / 2) / colWidth),
      y: Math.floor((event.clientY - rect.top - GAP / 2) / ROW_HEIGHT),
    }
  }

  // Right-click on empty space → "Add … here" at that spot in the grid.
  const [addMenu, setAddMenu] = useState(null)
  const closeAddMenu = useCallback(() => setAddMenu(null), [])
  function openAddMenu(event) {
    if (stacked || event.target.closest('.react-grid-item, .starter-button')) return
    event.preventDefault()
    setAddMenu({ x: event.clientX, y: event.clientY, at: cellAt(event) })
  }

  // A link dragged in from a browser tab or another page lands where dropped.
  // (Dashboard catches drops everywhere else; the flag tells it this one is handled.)
  // A sidebar card dragged over the workspace can be dropped here too.
  const [cardOver, setCardOver] = useState(false)
  const dropProps = {
    onDragOver: (event) => {
      if (!isCardDrag(event.dataTransfer) || !onDropCard) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      if (!cardOver) setCardOver(true)
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setCardOver(false)
    },
    onDrop: (event) => {
      if (isCardDrag(event.dataTransfer)) {
        event.preventDefault()
        setCardOver(false)
        const id = event.dataTransfer.getData(CARD_TYPE)
        if (id) onDropCard?.(id, stacked ? null : cellAt(event))
        return
      }
      const link = droppedLink(event.dataTransfer)
      if (!link) return
      event.preventDefault()
      event.nativeEvent.homeroomHandled = true
      onDropLink(link, stacked ? null : cellAt(event))
    },
  }
  const addMenuElement = addMenu && (
    <ContextMenu
      x={addMenu.x}
      y={addMenu.y}
      onClose={closeAddMenu}
      items={Object.entries(WIDGETS).map(([type, widget]) => ({
        label: `Add ${widget.title} here`,
        onSelect: () => onAddWidget(type, addMenu.at),
      }))}
    />
  )

  function handleLayoutChange(newLayout) {
    const positions = newLayout.map(pickPosition)
    if (JSON.stringify(positions) !== JSON.stringify(grid)) onGridChange(positions)
  }

  if (widgets.length === 0) {
    return (
      <div className={`workspace${cardOver ? ' card-drop' : ''}`} ref={containerRef} onContextMenu={openAddMenu} {...dropProps}>
        {addMenuElement}
        {showStarter ? (
          <div className="empty-area starter">
            <h2>Start building your dashboard</h2>
            {starterActions}
            <p>Click a widget to add it. Drag it anywhere to move it, resize it from any edge, and right-click for more.</p>
            <div className="starter-grid">
              {Object.entries(WIDGETS).map(([type, widget]) => {
                const Icon = widget.tab.icon
                return (
                  <button key={type} type="button" className="starter-button" onClick={() => onAddWidget(type)}>
                    <Icon />
                    <strong>{widget.title}</strong>
                    <UseBadge use={widget.use} />
                    <span>{widget.description}</span>
                  </button>
                )
              })}
            </div>
            <p className="setup-note">Want a sidebar? Use “+ Add widget” and choose Sidebar.</p>
          </div>
        ) : (
          <div className="empty-area">
            <h2>This space is yours</h2>
            <p>Right-click anywhere here to add a widget, or use “+ Add widget”.</p>
          </div>
        )}
      </div>
    )
  }

  if (stacked) {
    // Narrow screens: one column in reading order (top to bottom, left to right).
    const ordered = [...layout].sort((a, b) => a.y - b.y || a.x - b.x)
    return (
      <div className="workspace stack" ref={containerRef}>
        {ordered.map((item) => (
          <div key={item.i} style={{ height: item.h * ROW_HEIGHT }}>
            {renderWidget(widgets.find((widget) => widget.id === item.i))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`workspace${cardOver ? ' card-drop' : ''}`} ref={containerRef} onContextMenu={openAddMenu} {...dropProps}>
      {addMenuElement}
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: [0, 0], containerPadding: [GAP / 2, GAP / 2] }}
          dragConfig={{ cancel: `${NOT_DRAGGABLE}, .widget-control` }}
          resizeConfig={{ handles: ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] }}
          compactor={compactor}
          onDragStart={startDragging}
          onResizeStart={startDragging}
          onDrag={(_layout, oldItem, _newItem, _placeholder, event) =>
            compactor.setOutside(Boolean(onCardDrag?.(oldItem?.i, event)))
          }
          onDragStop={(_layout, oldItem, _newItem, _placeholder, event) => {
            clearActive()
            onCardDrop?.(oldItem?.i, event)
          }}
          onResizeStop={(finalLayout, oldItem, item) => {
            clearActive()
            if (widgets.find((widget) => widget.id === item?.i)?.type !== 'spotify') return
            const rows = snappedSpotifyRows(item.h, oldItem?.h ?? item.h)
            if (rows === item.h) return
            // After the grid library has saved its own result.
            setTimeout(() =>
              onGridChange(finalLayout.map(pickPosition).map((cell) => (cell.i === item.i ? { ...cell, h: rows } : cell))),
            )
          }}
          onLayoutChange={handleLayoutChange}
        >
          {widgets.map((widget) => (
            <div key={widget.id} className="grid-cell">
              {renderWidget(widget)}
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  )
}
