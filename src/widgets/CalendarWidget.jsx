import { useEffect, useMemo, useRef, useState } from 'react'
import { sampleEvents } from '../example.js'
import { toCalendarEmbed } from '../lib/embeds.js'
import { checkGoogleIcsUrl, looksLikeGoogleIcs } from '../lib/gcalFeed.js'
import { formatTime } from '../lib/dates.js'
import { useLoader } from '../lib/useFetch.js'
import { useStore, useStoreValue, widgetDataKey } from '../storage.js'
import {
  connectGoogle,
  disconnectGoogle,
  googleFetch,
  googleSend,
  hasScope,
  preloadGoogle,
  SCOPES,
  useGoogle,
} from '../lib/google.js'
import DayView from './DayView.jsx'
import EventEditor from './EventEditor.jsx'
import GoogleSignIn from './GoogleSignIn.jsx'

// Settings, one of:
//   { google: true } your Google Calendar via Sign in with Google → Day view
//                    with your real events and colors
//   { icsUrl }   a calendar's secret iCal address → our own Day view
//   { embedUrl } Google's embeddable calendar (from an email or embed code)
//   { sample: true } Alex's made-up week, in the Day view
const isSettings = (value) => value && typeof value === 'object'
const NO_SETTINGS = {}

// The setup box takes either kind of input.
function checkCalendarInput(input) {
  if (looksLikeGoogleIcs(input)) {
    const checked = checkGoogleIcsUrl(input)
    return checked.ok ? { ok: true, icsUrl: checked.url } : checked
  }
  return toCalendarEmbed(input)
}

async function loadCalendar(url) {
  let response
  try {
    response = await fetch('/api/gcal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
  } catch {
    throw new Error('You seem to be offline. Check your connection.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(data?.error ?? 'Couldn’t load your calendar. Try again in a minute.')
  return data
}

// Google's embeddable calendar (connected by email) has Week, Month and
// Agenda views but no Day view. For Day, the week is set to start on the
// chosen day and the frame is made wide enough that exactly that first
// column (plus the hour labels) fills the card; the other six days are
// clipped off. Google lays the week out as 72px of hour labels, then seven
// equal columns, with a 12px margin on the right.
const VIEWS = [
  ['day', 'Day', 'WEEK'],
  ['week', 'Week', 'WEEK'],
  ['month', 'Month', 'MONTH'],
  ['list', 'List', 'AGENDA'],
]
const HOUR_LABELS = 72
// 12px margin, plus room for a scrollbar in browsers that show one, so the
// next day never peeks in at the edge.
const RIGHT_MARGIN = 12 + 16
// Google's hours can't be restyled, so "compressing" them means zooming the
// whole calendar out (text gets smaller too). − / + step through these.
const ZOOMS = [0.55, 0.65, 0.75, 0.85, 1]
const DEFAULT_ZOOM = 0.75

const ymd = (date) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`

function embedFor(embedUrl, view, day) {
  const url = new URL(embedUrl)
  url.searchParams.set('mode', VIEWS.find(([key]) => key === view)[2])
  for (const name of ['showTitle', 'showPrint', 'showTabs', 'showCalendars']) url.searchParams.set(name, '0')
  url.searchParams.delete('wkst')
  url.searchParams.delete('dates')
  if (view === 'day') {
    // Our own ‹ Today › replace Google's arrows, which would jump a week.
    url.searchParams.set('showNav', '0')
    url.searchParams.set('showDate', '0')
    url.searchParams.set('wkst', String(day.getDay() + 1)) // 1 = Sunday
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
    url.searchParams.set('dates', `${ymd(day)}/${ymd(next)}`)
  }
  return url.toString()
}

function useSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])
  return size
}

function EmbedCalendar({ embedUrl, view, onView, zoom, onZoom }) {
  const [day, setDay] = useState(() => new Date())
  const frameRef = useRef(null)
  const size = useSize(frameRef)
  // The frame is drawn larger and scaled down, so everything inside shrinks.
  const width = size.width / zoom
  const zoomIndex = ZOOMS.indexOf(zoom)
  const isToday = ymd(day) === ymd(new Date())
  const step = (days) => setDay(new Date(day.getFullYear(), day.getMonth(), day.getDate() + days))
  // Frame width that makes one day column fill the card.
  const column = Math.max(120, width - HOUR_LABELS)
  const frameWidth = view === 'day' ? HOUR_LABELS + 7 * column + RIGHT_MARGIN : width

  return (
    <div className="calendar-embed">
      <div className="calendar-frame" ref={frameRef}>
        {size.width > 0 && (
          <iframe
            title="Google Calendar"
            src={embedFor(embedUrl, view, day)}
            loading="lazy"
            style={{ width: frameWidth, height: size.height / zoom, transform: `scale(${zoom})` }}
          />
        )}
        {/* Floats in the empty top-right corner of Google's header, so the
            calendar keeps the card's full height. */}
        <div className="calendar-controls">
          {view === 'day' && (
            <>
              {!isToday && (
                <button type="button" className="calendar-today" onClick={() => setDay(new Date())}>
                  Today
                </button>
              )}
              <button type="button" onClick={() => step(-1)} aria-label="Previous day" title="Previous day">
                ‹
              </button>
              <button type="button" onClick={() => step(1)} aria-label="Next day" title="Next day">
                ›
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onZoom(ZOOMS[zoomIndex - 1])}
            disabled={zoomIndex <= 0}
            aria-label="Zoom out (fit more hours)"
            title="Zoom out (fit more hours)"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => onZoom(ZOOMS[zoomIndex + 1])}
            disabled={zoomIndex >= ZOOMS.length - 1}
            aria-label="Zoom in (bigger text)"
            title="Zoom in (bigger text)"
          >
            +
          </button>
          <select value={view} onChange={(event) => onView(event.target.value)} aria-label="Calendar view">
            {VIEWS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

// Your calendars (the ones checked in Google Calendar) from two weeks ago to
// two months ahead, in the Day view's format, with Google's own colors.
async function loadGoogleCalendar(google) {
  const base = 'https://www.googleapis.com/calendar/v3'
  const [palette, list] = await Promise.all([
    googleFetch(`${base}/colors`, google),
    googleFetch(`${base}/users/me/calendarList`, google),
  ])
  const calendars = (list.items ?? []).filter((calendar) => calendar.selected || calendar.primary)
  const from = new Date(Date.now() - 14 * 86400000).toISOString()
  const to = new Date(Date.now() + 62 * 86400000).toISOString()
  const perCalendar = await Promise.all(
    calendars.map((calendar) =>
      googleFetch(
        `${base}/calendars/${encodeURIComponent(calendar.id)}/events?singleEvents=true&orderBy=startTime&maxResults=500&timeMin=${from}&timeMax=${to}`,
        google,
      )
        .then((result) => ({ calendar, items: result.items ?? [] }))
        .catch(() => ({ calendar, items: [] })),
    ),
  )
  const events = perCalendar.flatMap(({ calendar, items }) =>
    items
      .filter(
        (event) =>
          event.status !== 'cancelled' && !event.attendees?.some((person) => person.self && person.responseStatus === 'declined'),
      )
      .map((event) => {
        const color = palette.event?.[event.colorId]
        return {
          id: `${calendar.id}-${event.id}`,
          title: event.summary || '(No title)',
          location: event.location ?? '',
          allDay: Boolean(event.start?.date),
          start: event.start?.date ?? event.start?.dateTime,
          end: event.end?.date ?? event.end?.dateTime,
          color: color?.background ?? calendar.backgroundColor,
          textColor: color?.foreground ?? calendar.foregroundColor,
          calendarId: calendar.id,
          eventId: event.id,
          editable: calendar.accessRole === 'owner' || calendar.accessRole === 'writer',
          recurring: Boolean(event.recurringEventId),
        }
      }),
  )
  const tasks = hasScope(google, SCOPES.tasks) ? await loadGoogleTasks(google, from, to).catch(() => []) : []
  return { events: [...events, ...tasks], fetchedAt: new Date().toISOString() }
}

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1'
const dayAfter = (date) => {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

// Google Tasks with a due date in the window, from all your task lists, as
// all-day items for the Day view (kind: 'task').
async function loadGoogleTasks(google, from, to) {
  const lists = (await googleFetch(`${TASKS_API}/users/@me/lists?maxResults=100`, google)).items ?? []
  const perList = await Promise.all(
    lists.map((list) =>
      googleFetch(
        `${TASKS_API}/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=true&showHidden=true&maxResults=100&dueMin=${encodeURIComponent(from)}&dueMax=${encodeURIComponent(to)}`,
        google,
      )
        .then((result) => ({ list, items: result.items ?? [] }))
        .catch(() => ({ list, items: [] })),
    ),
  )
  return perList.flatMap(({ list, items }) =>
    items
      .filter((task) => task.due && task.title)
      .map((task) => {
        const date = task.due.slice(0, 10)
        const completed = task.status === 'completed'
        return {
          id: `task-${list.id}-${task.id}`,
          kind: 'task',
          listId: list.id,
          taskId: task.id,
          title: task.title,
          notes: task.notes ?? '',
          completed,
          allDay: true,
          start: date,
          end: dayAfter(date),
          color: completed ? '#9aa0a6' : '#1a73e8',
          textColor: '#fff',
          editable: true,
        }
      }),
  )
}

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const withoutEmpty = (body) =>
  JSON.parse(JSON.stringify(body, (key, value) => (value === null || value === '' ? undefined : value)))
// Ask for editing (and Google Tasks) along with reading, but keep going if
// someone unticks those.
const CALENDAR_SCOPES = [SCOPES.calendar, SCOPES.calendarEvents, SCOPES.tasks]

function GoogleCalendar({ onReset }) {
  const google = useGoogle()
  const connected = hasScope(google, SCOPES.calendar)
  const canEdit = hasScope(google, SCOPES.calendarEvents)
  // { event } to edit one, { start } for a new one, or null.
  const [editing, setEditing] = useState(null)
  const [askError, setAskError] = useState('')
  useEffect(() => {
    preloadGoogle()
  }, [])

  // Editing is part of signing in. If this connection doesn't have it yet
  // (signed in before editing existed, or the box was unticked), the first
  // click to add or change an event asks Google for it, then opens the box.
  async function edit(next) {
    setAskError('')
    if (!canEdit) {
      try {
        const granted = await connectGoogle(CALENDAR_SCOPES)
        if (!hasScope(granted, SCOPES.calendarEvents)) {
          setAskError('To add or change events, leave the “edit events” box checked on Google’s screen.')
          return
        }
      } catch (problem) {
        setAskError(problem.message)
        return
      }
    }
    setEditing(next)
  }
  const { data, error, loading, reload } = useLoader(
    connected ? `gcal|${google.email}|${google.expiresAt}` : null,
    () => loadGoogleCalendar(google),
    5 * 60 * 1000,
  )

  if (!connected) {
    return (
      <div className="widget-message">
        <p>Sign in again to see your Google Calendar.</p>
        <GoogleSignIn scopes={CALENDAR_SCOPES} required={[SCOPES.calendar]} label="Reconnect Google Calendar" />
        <button type="button" className="link-button" onClick={onReset}>
          Use a different way
        </button>
      </div>
    )
  }
  if (error) {
    return (
      <div className="widget-message">
        <p className="form-error">{error}</p>
        <button type="button" onClick={reload}>
          Try again
        </button>
      </div>
    )
  }
  if (loading) return <p className="empty-state">Loading your calendar…</p>

  const taskUrl = (task) => `${TASKS_API}/lists/${encodeURIComponent(task.listId)}/tasks/${encodeURIComponent(task.taskId)}`
  const eventUrl = (event) =>
    `${CALENDAR_API}/calendars/${encodeURIComponent(event.calendarId)}/events/${encodeURIComponent(event.eventId)}`

  return (
    <>
      <DayView
        events={data.events}
        onNewEvent={(start) => edit({ start })}
        onEventClick={(event) => event.editable && edit({ event })}
        footer={
          <p className="dayview-footer">
            {askError && <span className="form-error">{askError} </span>}
            {google.email ? `${google.email} · ` : ''}Updated {formatTime(new Date(data.fetchedAt))} ·{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                disconnectGoogle()
                onReset()
              }}
            >
              Sign out
            </button>
          </p>
        }
      />
      {editing && (
        <EventEditor
          event={editing.event ?? null}
          start={editing.start}
          onClose={() => setEditing(null)}
          onSave={async ({ kind, ...body }) => {
            if (kind === 'task') {
              // Tasks need their own permission; the first time, Google asks for it.
              if (!hasScope(google, SCOPES.tasks)) {
                const granted = await connectGoogle(CALENDAR_SCOPES)
                if (!hasScope(granted, SCOPES.tasks))
                  throw new Error('To add tasks, leave the Google Tasks box checked on Google’s screen.')
              }
              if (editing.event) await googleSend(taskUrl(editing.event), 'PATCH', body)
              else await googleSend(`${TASKS_API}/lists/@default/tasks`, 'POST', withoutEmpty(body))
            } else if (editing.event) await googleSend(eventUrl(editing.event), 'PATCH', body)
            // A new event only needs the fields that are set (the empty ones clear
            // old values when editing).
            else await googleSend(`${CALENDAR_API}/calendars/primary/events`, 'POST', withoutEmpty(body))
            reload()
          }}
          onDelete={
            editing.event
              ? async () => {
                  await googleSend(editing.event.kind === 'task' ? taskUrl(editing.event) : eventUrl(editing.event), 'DELETE')
                  reload()
                }
              : undefined
          }
        />
      )}
    </>
  )
}

// The setup screen: Sign in with Google (best), or just type an email for
// Google's own embedded calendar, or a sample week. Details are behind ⓘ.
function CalendarSetup({ canSignIn, onGoogle, onSave, onSample }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [details, setDetails] = useState(false)

  function save(event) {
    event.preventDefault()
    const result = checkCalendarInput(text)
    if (!result.ok) return setError(result.error)
    onSave(result)
  }

  return (
    <div className="calendar-setup">
      <p className="calendar-setup-title">📅 Connect your calendar</p>
      {canSignIn && (
        <>
          <div className="calendar-setup-google">
            <GoogleSignIn scopes={CALENDAR_SCOPES} required={[SCOPES.calendar]} onConnected={onGoogle} />
            <p className="setup-note">Your real events and colors · add and edit events</p>
          </div>
          <p className="setup-divider">
            <span>or</span>
          </p>
        </>
      )}
      <form className="calendar-setup-email" onSubmit={save}>
        <input
          type="text"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setError('')
          }}
          placeholder="Your Google email"
          aria-label="Your Google email"
          autoComplete="email"
          spellCheck={false}
        />
        <button type="submit" disabled={!text.trim()}>
          Use
        </button>
        <button
          type="button"
          className="calendar-setup-info"
          onClick={() => setDetails(!details)}
          aria-expanded={details}
          aria-label="How the email option works"
          title="How the email option works"
        >
          ⓘ
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {details && (
        <p className="setup-note calendar-setup-details">
          Shows Google’s own calendar (Day, Week, Month or List) in browsers where you’re signed in to that account; no sign-in to
          Homeroom needed. For a shared or club calendar, paste its Calendar ID or embed code.
        </p>
      )}
      <button type="button" className="link-button calendar-setup-sample" onClick={onSample}>
        Show a sample week
      </button>
    </div>
  )
}

function SampleCalendar() {
  const events = useMemo(() => sampleEvents(), [])
  return <DayView events={events} />
}

function FeedCalendar({ icsUrl, onReset }) {
  const { data, error, loading, reload } = useLoader(icsUrl, () => loadCalendar(icsUrl), 5 * 60 * 1000)
  if (error) {
    return (
      <div className="widget-message">
        <p className="form-error">{error}</p>
        <div className="button-row">
          <button type="button" onClick={reload}>
            Try again
          </button>
          <button type="button" onClick={onReset}>
            Use a different calendar
          </button>
        </div>
      </div>
    )
  }
  if (loading) return <p className="empty-state">Loading your calendar…</p>
  return (
    <DayView
      events={data.events}
      footer={<p className="dayview-footer">Updated {formatTime(new Date(data.fetchedAt))} · refreshes every 5 minutes</p>}
    />
  )
}

export default function CalendarWidget({ id }) {
  const store = useStore()
  const [settings, setSettings] = useStoreValue(widgetDataKey(id), NO_SETTINGS, isSettings)

  if (settings.sample) {
    return (
      <div className="calendar-sample">
        <SampleCalendar />
        {!store.example && (
          <button type="button" className="link-button" onClick={() => setSettings({})}>
            Connect my Google Calendar
          </button>
        )}
      </div>
    )
  }

  if (settings.google) return <GoogleCalendar onReset={() => setSettings({})} />
  if (settings.icsUrl) return <FeedCalendar icsUrl={settings.icsUrl} onReset={() => setSettings({})} />

  const embed = settings.embedUrl ? toCalendarEmbed(settings.embedUrl) : null
  if (!embed?.ok) {
    return (
      <CalendarSetup
        canSignIn={!store.example}
        onGoogle={() => setSettings({ google: true })}
        onSave={(result) => setSettings(result.icsUrl ? { icsUrl: result.icsUrl } : { embedUrl: result.embedUrl })}
        onSample={() => setSettings({ sample: true })}
      />
    )
  }

  return (
    <EmbedCalendar
      embedUrl={embed.embedUrl}
      view={settings.view ?? 'day'}
      onView={(view) => setSettings((current) => ({ ...current, view }))}
      zoom={ZOOMS.includes(settings.zoom) ? settings.zoom : DEFAULT_ZOOM}
      onZoom={(zoom) => setSettings((current) => ({ ...current, zoom }))}
    />
  )
}
