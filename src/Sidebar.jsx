import { Fragment, useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { WIDGETS } from './widgets/registry.js'

// A collapsed card is a one-line label (see CollapsedCard).
const COLLAPSED_HEIGHT = 40

// Card heights (px) where Spotify's player fills the card: its 80px compact,
// 152px standard and 352px track-list layouts, plus the 22px grab bar. A
// Spotify card snaps to the nearest one when resized (above the tallest,
// the track list simply grows).
const SPOTIFY_HEIGHTS = [102, 174, 374]

// Empty space above the first card and under the last one, so cards don't
// have to fill the whole column: drag the pill above the first card down,
// or the one under the last card up, to make it shorter.
const SPACE = 'sidebar-space'
const SPACE_TOP = 'sidebar-space-top'

// Give every widget its saved share of the column (in %), splitting any
// missing share evenly, then scale so the shares add up to 100. The empty
// space keeps its saved share, or none.
function sharesFor(ids, saved) {
  const known = ids.filter((id) => saved[id] > 0)
  const knownTotal = known.reduce((sum, id) => sum + saved[id], 0)
  const fallback = known.length ? knownTotal / known.length : 100 / ids.length
  const raw = ids.map((id) => (saved[id] > 0 ? saved[id] : fallback))
  const space = saved[SPACE] > 0 ? saved[SPACE] : 0
  const spaceTop = saved[SPACE_TOP] > 0 ? saved[SPACE_TOP] : 0
  const total = raw.reduce((sum, value) => sum + value, 0) + space + spaceTop
  return {
    [SPACE_TOP]: (spaceTop / total) * 100,
    ...Object.fromEntries(ids.map((id, index) => [id, (raw[index] / total) * 100])),
    [SPACE]: (space / total) * 100,
  }
}

// The collapsible column on the left: widgets stacked top to bottom, with a
// draggable divider between each pair. Cards can be dragged to a new position
// by grabbing any empty spot on them.
// incoming: where a card being dragged in from the workspace would land
// (an index), to show the same line as when reordering.
export default function Sidebar({ widgets, collapsed, sizes, onSizesChange, onReorder, incoming = null, renderWidget, stacked }) {
  const [dragId, setDragId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  // Each card's panel, to resize it from code (see snapSpotify).
  const panelRefs = useRef({})

  // Snap Spotify cards to a height its player fills: when the sidebar first
  // shows them, and after each resize.
  function snapSpotify() {
    for (const widget of widgets) {
      if (widget.type !== 'spotify' || collapsed.has(widget.id)) continue
      const height = document.querySelector(`[data-sidebar-card="${widget.id}"]`)?.parentElement?.offsetHeight
      if (!height || height >= SPOTIFY_HEIGHTS.at(-1)) continue
      const target = SPOTIFY_HEIGHTS.reduce((best, h) => (Math.abs(h - height) < Math.abs(best - height) ? h : best))
      if (Math.abs(target - height) > 2) panelRefs.current[widget.id]?.resize(target)
    }
  }
  const layoutKey = widgets.map((widget) => (collapsed.has(widget.id) ? `${widget.id}:c` : widget.id)).join('|')
  useEffect(() => {
    const frame = requestAnimationFrame(snapSpotify)
    return () => cancelAnimationFrame(frame)
    // Only when the set of cards changes (snapSpotify reads the latest ones).
  }, [layoutKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const dragPropsFor = (id) => ({
    onDragStart: (event) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', id)
      event.dataTransfer.setData('application/x-homeroom-card', id)
      const card = event.currentTarget.closest('.card, .collapsed-card')
      const rect = card.getBoundingClientRect()
      event.dataTransfer.setDragImage(card, event.clientX - rect.left, event.clientY - rect.top)
      // Changing the page during dragstart can cancel the drag in Chrome.
      setTimeout(() => {
        setDragId(id)
        // Embedded sites stop catching the mouse so the card can be dropped
        // anywhere, including onto the workspace (CSS: .card-dragging).
        document.documentElement.classList.add('card-dragging')
      })
    },
    onDragEnd: () => {
      setDragId(null)
      setDropTarget(null)
      document.documentElement.classList.remove('card-dragging')
    },
  })

  const dropPropsFor = (id) => ({
    onDragOver: (event) => {
      if (!dragId) return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const after = event.clientY > rect.top + rect.height / 2
      if (dropTarget?.id !== id || dropTarget.after !== after) setDropTarget({ id, after })
    },
    onDrop: (event) => {
      event.preventDefault()
      if (dragId && dragId !== id) onReorder(dragId, id, dropTarget?.after ?? false)
      setDragId(null)
      setDropTarget(null)
    },
  })

  const incomingTarget =
    incoming === null
      ? null
      : incoming < widgets.length
        ? { id: widgets[incoming].id, after: false }
        : { id: widgets.at(-1)?.id, after: true }
  const target = incomingTarget ?? dropTarget
  const dropClass = (id) => (target?.id === id && dragId !== id ? (target.after ? ' drop-after' : ' drop-before') : '')

  if (widgets.length === 0) {
    return (
      <div className="empty-area sidebar-empty">
        <p>Nothing in the sidebar. Add a widget here with “+ Add widget”, or move one over with ⇄.</p>
      </div>
    )
  }

  if (stacked) {
    return (
      <div className="stack">
        {widgets.map((widget) => (
          <div key={widget.id} className="stack-sidebar-item">
            {renderWidget(widget, {})}
          </div>
        ))}
      </div>
    )
  }

  const ids = widgets.map((widget) => widget.id)


  return (
    <Group
      // Remount when the list of widgets (or which are collapsed) changes so
      // the new sizes apply.
      key={ids.map((id) => (collapsed.has(id) ? `${id}:c` : id)).join('|')}
      orientation="vertical"
      // A generous grab area for the dividers (18px with a mouse), stopping
      // short of the − button at the top of each card.
      resizeTargetMinimumSize={{ fine: 18, coarse: 32 }}
      className={`sidebar-group${dragId ? ' dragging' : ''}`}
      defaultLayout={sharesFor(ids, sizes)}
      onLayoutChanged={(layout, meta) => {
        if (!meta?.isUserInteraction) return
        onSizesChange(layout)
        snapSpotify()
      }}
    >
      <Panel id={SPACE_TOP} minSize={0} className="sidebar-space" />
      <Separator className="resize-handle horizontal" title="Drag down to make the card below shorter" />
      {widgets.map((widget, index) => (
        <Fragment key={widget.id}>
          {index > 0 && <Separator className="resize-handle horizontal" title="Drag to resize these cards" />}
          <Panel
            id={widget.id}
            minSize={collapsed.has(widget.id) ? COLLAPSED_HEIGHT : (WIDGETS[widget.type].sidebarHeight ?? 70)}
            maxSize={collapsed.has(widget.id) ? COLLAPSED_HEIGHT : undefined}
            className={`sidebar-panel${dropClass(widget.id)}`}
            panelRef={(handle) => (panelRefs.current[widget.id] = handle)}
          >
            <div className="drop-zone" data-sidebar-card={widget.id} {...dropPropsFor(widget.id)}>
              {renderWidget(widget, dragPropsFor(widget.id))}
            </div>
          </Panel>
        </Fragment>
      ))}
      <Separator className="resize-handle horizontal" title="Drag up to make the card above shorter" />
      <Panel id={SPACE} minSize={0} className="sidebar-space" />
    </Group>
  )
}
