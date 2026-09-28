import { useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import AddWidgetMenu from './AddWidgetMenu.jsx'
import CollapsedCard from './CollapsedCard.jsx'
import ColorPicker from './ColorPicker.jsx'
import GuidePanel from './GuidePanel.jsx'
import ShareDialog from './ShareDialog.jsx'
import Dock from './Dock.jsx'
import { EXAMPLE_PERSON } from './example.js'
import { COLS, createPushDownCompactor, ROW_HEIGHT, upgradeGrid } from './lib/grid.js'
import { openExternal } from './lib/openExternal.js'
import { classifyLink } from './lib/classifyLink.js'
import { droppedLink, isLinkDrag } from './lib/drag.js'
import { showToast } from './lib/toast.js'
import { newId } from './lib/id.js'
import Sidebar from './Sidebar.jsx'
import { useStore, useStoreValue, widgetDataKey } from './storage.js'
import WidgetCard from './WidgetCard.jsx'
import WidgetFrame from './WidgetFrame.jsx'
import { OWN_DEFAULT_LAYOUT, tabOf, WIDGETS } from './widgets/registry.js'
import Workspace from './Workspace.jsx'

// Below this width the page switches to a single scrolling column.
const STACK_BELOW = 700

const isLayout = (value) =>
  value &&
  Array.isArray(value.sidebar) &&
  Array.isArray(value.workspace) &&
  Array.isArray(value.grid) &&
  value.sidebarSizes &&
  typeof value.sidebarSizes === 'object'

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const update = () => setWidth(window.innerWidth)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return width
}

const known = (widget) => WIDGETS[widget.type]

// `list` with `item` inserted at `index` (or at the end if there's no index).
function insertAt(list, index, item) {
  if (index == null || index >= list.length) return [...list, item]
  return [...list.slice(0, index), item, ...list.slice(index)]
}

function withoutKey(object, key) {
  const { [key]: _removed, ...rest } = object ?? {}
  return rest
}

// A new workspace widget goes where it was asked for (right-click → Add here),
// or else where it can be seen: the first empty spot in the part of the
// workspace on screen (top to bottom, left to right). If nothing on screen is
// free, it goes at the top of what's showing and the cards there are pushed
// down to make room.
function newGridItem(type, id, grid, at, hidden = []) {
  const { h } = WIDGETS[type].size
  const w = WIDGETS[type].size.w
  if (at) return pushedIn(grid, { i: id, x: Math.max(0, Math.min(at.x, COLS - w)), y: Math.max(0, at.y), w, h })
  const others = grid.filter((item) => !hidden.includes(item.i))
  const { top, bottom: last } = visibleRows()
  const free = (x, y) => !others.some((o) => x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h)
  for (let y = top; y + h <= Math.max(last, top + h); y++) {
    for (let x = 0; x + w <= COLS; x++) if (free(x, y)) return { item: { i: id, x, y, w, h }, grid }
  }
  return pushedIn(grid, { i: id, x: 0, y: top, w, h })
}

// Place `item` exactly there, pushing any cards it covers down.
function withNewItem(layout, type, id, at) {
  // Cards show at least their type's minimum size (see Workspace), so plan
  // with the sizes they actually take up on screen.
  const collapsed = layout.collapsed ?? {}
  const shown = layout.grid.map((cell) => {
    const widget = layout.workspace.find((item) => item.id === cell.i)
    const size = widget && !collapsed[cell.i] && WIDGETS[widget.type]?.size
    return size ? { ...cell, w: Math.max(cell.w, size.minW), h: Math.max(cell.h, size.minH) } : cell
  })
  const { item, grid } = newGridItem(type, id, shown, at, layout.minimized ?? [])
  return [...grid, item]
}

function pushedIn(grid, item) {
  const compactor = createPushDownCompactor()
  const layout = [...grid, item]
  compactor.setActive(item.i, layout)
  const settled = compactor.compact(layout)
  return { item, grid: settled.filter((cell) => cell.i !== item.i) }
}

// Which grid rows of the workspace are on screen right now.
function visibleRows() {
  const workspace = document.querySelector('.workspace')
  if (!workspace) return { top: 0, bottom: Infinity }
  const rect = workspace.getBoundingClientRect()
  const panel = workspace.closest('.workspace-panel')?.getBoundingClientRect()
  const viewTop = Math.max(0, panel?.top ?? 0)
  const viewBottom = Math.min(window.innerHeight, panel?.bottom ?? window.innerHeight)
  return {
    top: Math.max(0, Math.floor((viewTop - rect.top) / ROW_HEIGHT)),
    bottom: Math.max(0, Math.floor((viewBottom - rect.top) / ROW_HEIGHT)),
  }
}

// A collapsed workspace card is one label tall (5 rows = 40px with its gap)
// and about as wide as its name.
const COLLAPSED_ROWS = 5

function collapsedCols(title) {
  const colWidth = (document.querySelector('.workspace')?.clientWidth ?? 1200) / COLS
  return Math.max(4, Math.min(COLS, Math.ceil((title.length * 7.5 + 64) / colWidth)))
}

// The sidebar's outline and header, so it reads as its own column.
function SidebarFrame({ onHide, dropping, children }) {
  return (
    <section className={`sidebar-frame${dropping ? ' drop-target' : ''}`} aria-label="Sidebar">
      <div className="sidebar-head">
        <span>{dropping ? 'Drop to move it here' : 'Sidebar'}</span>
        <button type="button" onClick={onHide} title="Hide the sidebar (bring it back from the top left)">
          ‹ Hide
        </button>
      </div>
      {children}
    </section>
  )
}

export default function Dashboard({ layoutKey, tabs, hasOwn, onBuildOwn, onViewExample, onResetExample, onCopyTab, onAddGamesTab }) {
  const store = useStore()
  const [layout, setLayout] = useStoreValue(layoutKey, OWN_DEFAULT_LAYOUT, isLayout)
  const [maximizedId, setMaximizedId] = useState(null)
  // The "Colors" picker: where it's open, and whether it colors the sidebar
  // or every card on this dashboard.
  const [colorsPicker, setColorsPicker] = useState(null)
  const [colorScope, setColorScope] = useState('sidebar')
  const [sharing, setSharing] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  // While a workspace card is dragged over the sidebar: where it would go
  // (an index in the sidebar list), else null.
  const [sidebarDrop, setSidebarDrop] = useState(null)
  // The card just added: scrolled into view and briefly highlighted.
  const [newestId, setNewestId] = useState(null)
  const stacked = useWindowWidth() < STACK_BELOW

  // Minimized cards keep their place in the sidebar/workspace lists (and their
  // grid position) but are shown only in the dock until restored.
  const minimized = new Set(Array.isArray(layout.minimized) ? layout.minimized : [])
  const visible = (widget) => known(widget) && !minimized.has(widget.id)
  const sidebarWidgets = layout.sidebar.filter(visible)
  const workspaceWidgets = layout.workspace.filter(visible)
  const dockWidgets = [...layout.sidebar, ...layout.workspace].filter((widget) => known(widget) && minimized.has(widget.id))
  const visibleGrid = layout.grid.filter((item) => !minimized.has(item.i))
  // Collapsed cards show as a small label; each remembers its full size in
  // the workspace ({ w, h }, or {} in the sidebar) for when it's opened again.
  const collapsedSizes = layout.collapsed && typeof layout.collapsed === 'object' ? layout.collapsed : {}
  const collapsed = new Set(Object.keys(collapsedSizes))
  const maximized = [...sidebarWidgets, ...workspaceWidgets].find((widget) => widget.id === maximizedId)

  // Layouts saved before the fine grid get converted once.
  useEffect(() => {
    if (layout.gridVersion !== 2) {
      setLayout((current) => ({ ...current, grid: upgradeGrid(current.grid), gridVersion: 2 }))
    }
  }, [layout.gridVersion, setLayout])

  useEffect(() => {
    if (!maximizedId) return
    const onKey = (event) => event.key === 'Escape' && setMaximizedId(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [maximizedId])

  // Light / Dark forces this dashboard's look; no theme follows the computer.
  // Set on <html> so menus and pop-ups (drawn outside .app) match too.
  useEffect(() => {
    if (layout.theme) document.documentElement.dataset.theme = layout.theme
    else delete document.documentElement.dataset.theme
  }, [layout.theme])

  // Embedded sites (Desmos, Excalidraw, ...) can focus themselves as they
  // load, which scrolls the workspace down to them. Undo any workspace scroll
  // that didn't come from the person (wheel, keys, touch, clicks) or from us
  // (bringing a new card into view).
  useEffect(() => {
    let lastInput = 0
    const positions = new WeakMap()
    const noteInput = () => (lastInput = Date.now())
    const onScroll = (event) => {
      const panel = event.target
      if (!(panel instanceof Element) || !panel.classList.contains('workspace-panel')) return
      const now = Date.now()
      if (now - lastInput < 1000 || now < (panel.homeroomScrollAllowedUntil ?? 0)) positions.set(panel, panel.scrollTop)
      else panel.scrollTop = positions.get(panel) ?? 0
    }
    const inputs = ['wheel', 'keydown', 'touchstart', 'pointerdown']
    for (const type of inputs) window.addEventListener(type, noteInput, { capture: true, passive: true })
    document.addEventListener('scroll', onScroll, true)
    return () => {
      for (const type of inputs) window.removeEventListener(type, noteInput, { capture: true })
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [])

  // Scroll a newly added card into view, then let its glow fade.
  useEffect(() => {
    if (!newestId) return
    const frame = requestAnimationFrame(() => {
      const card = document.querySelector(`[data-widget-id="${newestId}"]`)
      const panel = card?.closest('.workspace-panel')
      if (panel) panel.homeroomScrollAllowedUntil = Date.now() + 1500 // our own scroll (see above)
      card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
    const timer = setTimeout(() => setNewestId(null), 1800)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [newestId])

  const update = (changes) => setLayout((current) => ({ ...current, ...changes(current) }))

  // `at` is a grid position ({ x, y }) from right-click → "Add … here" or a
  // dropped link; `settings` pre-fills the new card (e.g. a dropped playlist).
  function addWidget(type, area, at, settings) {
    const id = `${type}-${newId()}`
    if (settings !== undefined) store.set(widgetDataKey(id), settings)
    update((current) =>
      area === 'sidebar'
        ? { sidebar: [...current.sidebar, { id, type }], sidebarOpen: true }
        : {
            workspace: [...current.workspace, { id, type }],
            grid: withNewItem(current, type, id, at),
          },
    )
    setNewestId(id)
  }

  // A link dragged onto the dashboard becomes the best card for it (see
  // classifyLink.js). Sites that can't be shown inside a card become a
  // shortcut in the dashboard's Links card (made if there isn't one).
  async function dropLink(link, at) {
    showToast('Adding that link…', 3000)
    const card = await classifyLink(link)
    if (!card) return showToast('That didn’t look like a website link.')
    if (card.type !== 'links') {
      addWidget(card.type, 'workspace', at, card.settings)
      return showToast(`Added: ${card.label}`)
    }
    const shortcut = { id: newId(), ...card.link }
    const existing = [...layout.sidebar, ...layout.workspace].find((widget) => widget.type === 'links')
    if (existing) {
      const current = store.get(widgetDataKey(existing.id)) ?? {}
      store.set(widgetDataKey(existing.id), { ...current, links: [...(current.links ?? []), shortcut] })
      if (minimized.has(existing.id)) restoreWidget(existing.id)
      else setNewestId(existing.id)
    } else {
      addWidget('links', 'workspace', at, { links: [shortcut] })
    }
    showToast(`${card.label} can’t be shown inside other websites, so it was added as a ↗ shortcut in your Links card.`, 8000)
  }

  const dropLinkRef = useRef(dropLink)
  useEffect(() => {
    dropLinkRef.current = dropLink
  })

  // Pasting a link (Cmd/Ctrl+V) anywhere on the dashboard, when you're not
  // typing in a box, adds it as a card too. Easier than dragging between tabs.
  useEffect(() => {
    const onPaste = (event) => {
      if (event.target.closest?.('input, textarea, [contenteditable]')) return
      const text = event.clipboardData?.getData('text')?.trim() ?? ''
      if (!/^https?:\/\/\S+$/i.test(text)) return
      event.preventDefault()
      dropLinkRef.current(text, null)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  // Dropping a link anywhere else (the sidebar, the toolbar) would make the
  // browser leave the dashboard, so catch those drops too and add the card
  // at the bottom of the workspace. While a link is dragged, embedded sites
  // stop catching the mouse (CSS: .link-dragging) so the drop reaches us.
  useEffect(() => {
    let depth = 0
    const root = document.documentElement
    const onDragEnter = (event) => {
      if (!isLinkDrag(event.dataTransfer)) return
      depth += 1
      root.classList.add('link-dragging')
    }
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) root.classList.remove('link-dragging')
    }
    const onDragOver = (event) => {
      if (isLinkDrag(event.dataTransfer)) event.preventDefault()
    }
    const onDrop = (event) => {
      depth = 0
      root.classList.remove('link-dragging')
      if (!isLinkDrag(event.dataTransfer)) return
      event.preventDefault()
      if (event.homeroomHandled) return
      const link = droppedLink(event.dataTransfer)
      if (link) dropLinkRef.current(link, null)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
      root.classList.remove('link-dragging')
    }
  }, [])

  function minimizeWidget(id) {
    if (maximizedId === id) setMaximizedId(null)
    update((current) => ({ minimized: [...new Set([...(current.minimized ?? []), id])] }))
  }

  function restoreWidget(id) {
    update((current) => ({ minimized: (current.minimized ?? []).filter((item) => item !== id) }))
    setNewestId(id)
  }

  function collapseWidget(id, title) {
    update((current) => {
      const item = current.grid.find((cell) => cell.i === id)
      const inWorkspace = current.workspace.some((widget) => widget.id === id)
      return {
        collapsed: { ...current.collapsed, [id]: inWorkspace && item ? { w: item.w, h: item.h } : {} },
        grid:
          inWorkspace && item
            ? current.grid.map((cell) => (cell.i === id ? { ...cell, w: collapsedCols(title), h: COLLAPSED_ROWS } : cell))
            : current.grid,
      }
    })
  }

  // Back to full size; cards now in the way are pushed down, like when a
  // card is resized over them.
  function expandWidget(id) {
    update((current) => {
      const { [id]: size, ...rest } = current.collapsed ?? {}
      let grid = current.grid
      if (size?.w && size?.h) {
        grid = grid.map((cell) => (cell.i === id ? { ...cell, w: size.w, h: size.h } : cell))
        const compactor = createPushDownCompactor()
        compactor.setActive(id, grid)
        grid = compactor.compact(grid)
      }
      return { collapsed: rest, grid }
    })
    setNewestId(id)
  }

  function removeWidget(id) {
    store.remove(widgetDataKey(id))
    store.remove(`style:${id}`)
    if (maximizedId === id) setMaximizedId(null)
    update((current) => ({
      sidebar: current.sidebar.filter((widget) => widget.id !== id),
      workspace: current.workspace.filter((widget) => widget.id !== id),
      grid: current.grid.filter((item) => item.i !== id),
      minimized: (current.minimized ?? []).filter((item) => item !== id),
      collapsed: withoutKey(current.collapsed, id),
    }))
  }

  // Moving a card opens it back up (it gets its default size in the workspace).
  // Where in the sidebar a point on screen falls: the index to insert at
  // (before the first card whose middle is below it), or null if outside.
  function sidebarIndexAt(event) {
    const point = event?.changedTouches?.[0] ?? event
    const frame = document.querySelector('.sidebar-frame')
    if (!frame || point?.clientX == null) return null
    const rect = frame.getBoundingClientRect()
    if (point.clientX < rect.left || point.clientX > rect.right || point.clientY < rect.top || point.clientY > rect.bottom) return null
    const panels = [...frame.querySelectorAll('.sidebar-panel')]
    const index = panels.findIndex((panel) => {
      const box = panel.getBoundingClientRect()
      return point.clientY < box.top + box.height / 2
    })
    return index === -1 ? panels.length : index
  }

  // Drag a workspace card over the sidebar and let go to move it there.
  // Returns whether it's over the sidebar (so it stops pushing other cards).
  function dragCard(_id, event) {
    const index = sidebarIndexAt(event)
    if (index !== sidebarDrop) setSidebarDrop(index)
    return index !== null
  }

  function dropCard(id, event) {
    const index = sidebarIndexAt(event)
    setSidebarDrop(null)
    if (id && index !== null) moveWidget(id, index)
  }

  // `sidebarIndex`: where it goes in the sidebar; `at`: the workspace cell it
  // was dropped on (else the first free spot on screen).
  function moveWidget(id, sidebarIndex, at) {
    update((current) => ({ collapsed: withoutKey(current.collapsed, id) }))
    update((current) => {
      const inSidebar = current.sidebar.find((widget) => widget.id === id)
      if (inSidebar) {
        return {
          sidebar: current.sidebar.filter((widget) => widget.id !== id),
          workspace: [...current.workspace, inSidebar],
          grid: withNewItem({ ...current, grid: current.grid.filter((item) => item.i !== id) }, inSidebar.type, id, at),
        }
      }
      const inWorkspace = current.workspace.find((widget) => widget.id === id)
      return {
        workspace: current.workspace.filter((widget) => widget.id !== id),
        grid: current.grid.filter((item) => item.i !== id),
        sidebar: insertAt(current.sidebar, sidebarIndex, inWorkspace),
        sidebarOpen: true,
      }
    })
  }

  function reorderSidebar(fromId, toId, after) {
    update((current) => {
      const moving = current.sidebar.find((widget) => widget.id === fromId)
      const rest = current.sidebar.filter((widget) => widget.id !== fromId)
      const index = rest.findIndex((widget) => widget.id === toId) + (after ? 1 : 0)
      return { sidebar: [...rest.slice(0, index), moving, ...rest.slice(index)] }
    })
  }

  const tabFor = (widget) => tabOf(widget, store.get(widgetDataKey(widget.id)))

  function menuItemsFor(widget, area, isMaximized) {
    const { editLabel } = WIDGETS[widget.type]
    const tab = tabFor(widget)
    return [
      editLabel && { label: editLabel, onSelect: () => store.set(widgetDataKey(widget.id), {}) },
      tab.href && {
        label: `Open ${tab.address}`,
        onSelect: () => openExternal(tab.href),
      },
      isMaximized
        ? { label: 'Exit full screen', onSelect: () => setMaximizedId(null) }
        : { label: 'Full screen', onSelect: () => setMaximizedId(widget.id) },
      !isMaximized &&
        (collapsed.has(widget.id)
          ? { label: 'Expand', onSelect: () => expandWidget(widget.id) }
          : { label: 'Collapse', onSelect: () => collapseWidget(widget.id, tab.title) }),
      { label: 'Minimize to dock', onSelect: () => minimizeWidget(widget.id) },
      !isMaximized && {
        label: area === 'sidebar' ? 'Move to workspace' : 'Move to sidebar',
        onSelect: () => moveWidget(widget.id),
      },
      { label: 'Remove', danger: true, onSelect: () => removeWidget(widget.id) },
    ].filter(Boolean)
  }

  function resetLayout() {
    if (store.example) {
      onResetExample()
      return
    }
    if (!window.confirm('Clear this dashboard? All its widgets and what’s in them (to-dos, links) will be removed.')) return
    for (const widget of [...layout.sidebar, ...layout.workspace]) {
      store.remove(widgetDataKey(widget.id))
      store.remove(`style:${widget.id}`)
    }
    setMaximizedId(null)
    setLayout(OWN_DEFAULT_LAYOUT)
  }

  // "Colors": give many cards the same background at once (the sidebar's, or
  // every card on this dashboard). Cards the Spotify player covers are
  // skipped. Each card can still be recolored on its own afterwards.
  const colorableIn = (scope) =>
    (scope === 'sidebar' ? sidebarWidgets : [...sidebarWidgets, ...workspaceWidgets]).filter(
      (widget) => WIDGETS[widget.type].colorable !== false,
    )

  function colorCards(scope, color) {
    for (const widget of colorableIn(scope)) {
      if (color) store.set(`style:${widget.id}`, { background: color })
      else store.remove(`style:${widget.id}`)
    }
  }

  // Each card gets its app's own color (Sleeper navy, ESPN red, ...); cards
  // without one go back to the default.
  function appColorCards(scope) {
    for (const widget of colorableIn(scope)) {
      const brand = WIDGETS[widget.type].brandColor
      if (brand) store.set(`style:${widget.id}`, { background: brand })
      else store.remove(`style:${widget.id}`)
    }
  }

  // The color those cards share, if they all have the same one.
  function sharedColor(scope) {
    const colors = colorableIn(scope).map((widget) => store.get(`style:${widget.id}`)?.background ?? null)
    return colors.length && colors.every((color) => color === colors[0]) ? colors[0] : null
  }

  // For "Match Spotify playlist": the first Spotify widget with a playlist.
  function getSpotifyEmbedUrl() {
    const spotify = [...layout.sidebar, ...layout.workspace].find((widget) => widget.type === 'spotify')
    return spotify ? (store.get(widgetDataKey(spotify.id))?.url ?? null) : null
  }

  function renderWidget(widget, area, dragProps = {}) {
    const { component: Component } = WIDGETS[widget.type]
    const tab = tabFor(widget)
    const isMaximized = maximizedId === widget.id
    if (collapsed.has(widget.id) && !isMaximized) {
      return (
        <CollapsedCard
          widgetId={widget.id}
          title={tab.title}
          Icon={tab.icon}
          onExpand={() => expandWidget(widget.id)}
          menuItems={() => menuItemsFor(widget, area, false)}
          {...(area === 'sidebar' ? dragProps : {})}
        />
      )
    }
    // Phones get the browser-window frame, whose buttons are always visible
    // (no hover or right-click there). Everywhere else widgets are cards.
    if (!stacked) {
      return (
        <WidgetCard
          widgetId={widget.id}
          type={widget.type}
          title={tab.title}
          // A function, so the menu reflects the card's latest settings
          // (e.g. which tool it shows) each time it opens.
          menuItems={() => menuItemsFor(widget, area, isMaximized)}
          colorable={WIDGETS[widget.type].colorable !== false}
          getSpotifyEmbedUrl={getSpotifyEmbedUrl}
          appColor={WIDGETS[widget.type].brandColor}
          use={WIDGETS[widget.type].use}
          highlight={widget.id === newestId}
          onCollapse={isMaximized ? undefined : () => collapseWidget(widget.id, tab.title)}
          {...(area === 'sidebar' && !isMaximized ? dragProps : {})}
        >
          <Component id={widget.id} />
        </WidgetCard>
      )
    }
    return (
      <WidgetFrame
        tab={tab}
        maximized={isMaximized}
        moveLabel={area === 'sidebar' ? 'Move to workspace' : 'Move to sidebar'}
        onMove={() => moveWidget(widget.id)}
        onMaximize={() => setMaximizedId(isMaximized ? null : widget.id)}
        onRemove={() => removeWidget(widget.id)}
      >
        <Component id={widget.id} />
      </WidgetFrame>
    )
  }

  // While a widget is full screen, its normal spot shows a placeholder so the
  // widget isn't on the page twice.
  const renderSlot = (area) => (widget, dragProps) =>
    widget.id === maximizedId ? (
      <div className="maximized-placeholder">Showing full screen</div>
    ) : (
      renderWidget(widget, area, dragProps)
    )

  const sidebar = (
    <Sidebar
      widgets={sidebarWidgets}
      collapsed={collapsed}
      sizes={layout.sidebarSizes}
      onSizesChange={(sizes) => update(() => ({ sidebarSizes: sizes }))}
      onReorder={reorderSidebar}
      incoming={sidebarDrop}
      renderWidget={renderSlot('sidebar')}
      stacked={stacked}
    />
  )
  const workspace = (
    <Workspace
      widgets={workspaceWidgets}
      collapsed={collapsed}
      onCardDrag={dragCard}
      onCardDrop={dropCard}
      onDropCard={(id, at) => layout.sidebar.some((widget) => widget.id === id) && moveWidget(id, undefined, at)}
      grid={visibleGrid}
      // Keep minimized cards' saved positions when the visible ones move.
      onGridChange={(grid) => update((current) => ({ grid: [...grid, ...current.grid.filter((item) => minimized.has(item.i))] }))}
      onAddWidget={(type, at) => addWidget(type, 'workspace', at)}
      onDropLink={dropLink}
      showStarter={sidebarWidgets.length === 0 && dockWidgets.length === 0}
      starterActions={
        !store.example && (
          <div className="starter-quick">
            <span>New here?</span>
            <button type="button" className="primary" onClick={onViewExample}>
              👀 See an example dashboard
            </button>
            {onAddGamesTab && (
              <button type="button" onClick={onAddGamesTab}>
                🎮 Add the Games tab
              </button>
            )}
          </div>
        )
      }
      renderWidget={renderSlot('workspace')}
      stacked={stacked}
    />
  )

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-start">
          {/* While the sidebar is open, its own header has "Hide". */}
          {!layout.sidebarOpen && (
            <button
              type="button"
              className="sidebar-show"
              onClick={() => update(() => ({ sidebarOpen: true }))}
              title="Show the sidebar"
            >
              › Sidebar
            </button>
          )}
          {sidebarWidgets.length + workspaceWidgets.length > 0 && !stacked && (
            <button
              type="button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setColorScope(layout.sidebarOpen && sidebarWidgets.length > 0 ? 'sidebar' : 'all')
                setColorsPicker({ x: rect.left, y: rect.bottom + 6 })
              }}
              title="Color many cards at once"
            >
              🎨 Colors
            </button>
          )}
          <h1>Homeroom</h1>
          {tabs}
        </div>
        <div className="toolbar-actions">
          <button type="button" onClick={() => setGuideOpen(true)} title="How to use Homeroom, and features you might miss">
            ❓ Guide
          </button>
          <button type="button" onClick={() => setSharing(true)} title="Show a QR code and link to this site">
            📱 Share
          </button>
          <AddWidgetMenu onAdd={addWidget} onAddLink={(link) => dropLink(link, null)} />
          <button type="button" onClick={resetLayout}>
            {store.example ? 'Reset' : 'Clear all'}
          </button>
          {!store.example && (
            <button type="button" className="example-button" onClick={onViewExample} title="A sample dashboard showing what Homeroom can do">
              👀 See an example
            </button>
          )}
        </div>
      </header>

      {store.example && (
        <div className="example-banner" role="note">
          <div className="example-banner-text">
            <p>
              <strong>👋 This is a sample dashboard</strong> for {EXAMPLE_PERSON}, a fictional Cal Poly student. It all
              resets when you reload.
            </p>
            <ul className="example-tips" aria-label="Things to try">
              <li>Switch dashboards with the tabs above</li>
              <li>Drag any card to move it</li>
              <li>Right-click a card for options</li>
              <li>🎨 Colors → Match Spotify</li>
              <li>Paste any link (⌘V) to add it as a card</li>
            </ul>
          </div>
          <div className="example-banner-actions">
            {onCopyTab && (
              <button type="button" onClick={onCopyTab} title="Copy this tab, with all its cards, into your own dashboards">
                ⧉ Copy this tab
              </button>
            )}
            <button type="button" className="primary" onClick={onBuildOwn}>
              {hasOwn ? 'Back to my dashboard →' : 'Build your own →'}
            </button>
          </div>
        </div>
      )}

      <main className="main">
        {stacked ? (
          <div className="stacked-page">
            {layout.sidebarOpen && <SidebarFrame onHide={() => update(() => ({ sidebarOpen: false }))}>{sidebar}</SidebarFrame>}
            {workspace}
          </div>
        ) : layout.sidebarOpen ? (
          <Group
            orientation="horizontal"
            className="main-group"
            defaultLayout={{ sidebar: layout.sidebarSize, workspace: 100 - layout.sidebarSize }}
            onLayoutChanged={(sizes, meta) => {
              if (meta?.isUserInteraction && sizes.sidebar) update(() => ({ sidebarSize: sizes.sidebar }))
            }}
          >
            {/* Dragging the edge past the minimum snaps the sidebar closed. */}
            <Panel
              id="sidebar"
              minSize={200}
              maxSize="65%"
              collapsible
              collapsedSize={0}
              onResize={(size) => {
                if (size.inPixels === 0) update(() => ({ sidebarOpen: false }))
              }}
              className="sidebar"
            >
              <SidebarFrame onHide={() => update(() => ({ sidebarOpen: false }))} dropping={sidebarDrop !== null}>
                {sidebar}
              </SidebarFrame>
            </Panel>
            <Separator className="resize-handle vertical" />
            <Panel id="workspace" className="workspace-panel">
              {workspace}
            </Panel>
          </Group>
        ) : (
          <div className="workspace-panel full">{workspace}</div>
        )}
      </main>

      <Dock widgets={dockWidgets} tabFor={tabFor} onRestore={restoreWidget} />

      {sharing && <ShareDialog onClose={() => setSharing(false)} />}
      {guideOpen && <GuidePanel onClose={() => setGuideOpen(false)} />}

      {colorsPicker && (
        <ColorPicker
          title="Colors"
          x={colorsPicker.x}
          y={colorsPicker.y}
          value={sharedColor(colorScope)}
          spotifyEmbedUrl={getSpotifyEmbedUrl()}
          onChange={(color) => colorCards(colorScope, color)}
          onAppColors={() => appColorCards(colorScope)}
          onClose={() => setColorsPicker(null)}
        >
          <div className="segmented-tabs" role="radiogroup" aria-label="Dashboard background">
            {[
              ['light', '☀️ Light'],
              ['dark', '🌙 Dark'],
              [undefined, '💻 Auto'],
            ].map(([theme, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={layout.theme === theme}
                className={layout.theme === theme ? 'active' : undefined}
                onClick={() => update(() => ({ theme }))}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="segmented-tabs" role="radiogroup" aria-label="Which cards">
            {[
              ['sidebar', 'Sidebar'],
              ['all', 'Whole dashboard'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={colorScope === key}
                className={colorScope === key ? 'active' : undefined}
                onClick={() => setColorScope(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </ColorPicker>
      )}

      {maximized && (
        <div className="maximized-layer" onClick={(event) => event.target === event.currentTarget && setMaximizedId(null)}>
          <div className="maximized-window">
            {renderWidget(maximized, sidebarWidgets.includes(maximized) ? 'sidebar' : 'workspace')}
          </div>
        </div>
      )}
    </div>
  )
}
