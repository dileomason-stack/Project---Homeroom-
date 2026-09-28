import { createStore, widgetDataKey, writeJSON } from '../storage.js'
import { DEFAULT_DASHBOARDS, isDashboards, layoutKeyFor } from '../useDashboards.js'
import { newId } from './id.js'

// Where "Build your own" dashboards are saved (see App.jsx).
export const OWN_PREFIX = 'dashboard:own:'
export const HAS_OWN_KEY = 'dashboard:hasOwn'

// Copies one dashboard (e.g. a tab of Alex's example) into the visitor's own
// saved dashboards: every card gets a new id, with its place, size, color and
// settings, and the copy becomes the dashboard that opens next. Pass the own
// store that's on screen as `own` so the new tab shows up right away.
export function copyToOwnDashboards(fromStore, dashboard, own = createStore({ prefix: OWN_PREFIX })) {
  const layout = fromStore.get(layoutKeyFor(dashboard.id))
  if (!layout) return null

  const ids = new Map()
  const newIdFor = (id, type) => {
    if (!ids.has(id)) ids.set(id, `${type}-${newId()}`)
    return ids.get(id)
  }
  const widgets = [...(layout.sidebar ?? []), ...(layout.workspace ?? [])]
  for (const widget of widgets) {
    const id = newIdFor(widget.id, widget.type)
    const data = fromStore.get(widgetDataKey(widget.id))
    const style = fromStore.get(`style:${widget.id}`)
    if (data !== undefined) own.set(widgetDataKey(id), structuredClone(data))
    if (style !== undefined) own.set(`style:${id}`, structuredClone(style))
  }
  const swap = (id) => ids.get(id) ?? id
  const rekey = (object) => Object.fromEntries(Object.entries(object ?? {}).map(([id, value]) => [swap(id), value]))
  const copy = {
    ...structuredClone(layout),
    sidebar: (layout.sidebar ?? []).map((widget) => ({ ...widget, id: swap(widget.id) })),
    workspace: (layout.workspace ?? []).map((widget) => ({ ...widget, id: swap(widget.id) })),
    grid: (layout.grid ?? []).map((cell) => ({ ...cell, i: swap(cell.i) })),
    sidebarSizes: rekey(layout.sidebarSizes),
    ...(layout.minimized ? { minimized: layout.minimized.map(swap) } : {}),
    ...(layout.collapsed ? { collapsed: rekey(layout.collapsed) } : {}),
  }

  const dashboardId = `dash-${newId()}`
  own.set(layoutKeyFor(dashboardId), copy)
  const saved = own.get('dashboards')
  const list = isDashboards(saved) ? saved : DEFAULT_DASHBOARDS
  own.set('dashboards', { list: [...list.list, { id: dashboardId, name: dashboard.name }], activeId: dashboardId })
  writeJSON(HAS_OWN_KEY, true)
  return dashboardId
}
