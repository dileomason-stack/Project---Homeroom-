import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// A one-day calendar laid out like Google Calendar's Day view: the date in a
// circle, all-day events on top, then an hour grid with each event as a
// colored block (side by side when they overlap) and a red line at the
// current time. ‹ › step through days.
//
// events: [{ id, title, location, allDay, start, end, color?, textColor? }]
// where timed events use ISO instants and all-day events use 'YYYY-MM-DD'
// dates (end = the day after). Without a color, each title gets its own.

const HOUR_HEIGHT = 48
const DAY_MS = 24 * 60 * 60 * 1000
// Google Calendar's event colors; each event title always gets the same one.
const COLORS = ['#7cb342', '#0b8043', '#039be5', '#3f51b5', '#8e24aa', '#e67c73', '#f4511e', '#33b679']

// The event's own colors (from Google Calendar), or one picked by title.
const eventColors = (event) => ({ '--event': event.color ?? colorFor(event.title), '--event-text': event.textColor ?? '#fff' })

function colorFor(title) {
  let hash = 0
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return COLORS[hash % COLORS.length]
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// "9", "9:30", "12" plus am/pm, like Google: "9 – 10:20am", "11am – 12:30pm".
function clock(date) {
  const hours = date.getHours() % 12 || 12
  const minutes = date.getMinutes()
  return minutes ? `${hours}:${String(minutes).padStart(2, '0')}` : `${hours}`
}
const meridiem = (date) => (date.getHours() < 12 ? 'am' : 'pm')

function timeRange(start, end) {
  if (meridiem(start) === meridiem(end)) return `${clock(start)} – ${clock(end)}${meridiem(end)}`
  return `${clock(start)}${meridiem(start)} – ${clock(end)}${meridiem(end)}`
}

// Place the day's timed events: overlapping events share the width in columns.
function layoutDay(events, day) {
  const dayStart = day.getTime()
  const dayEnd = dayStart + DAY_MS
  const items = events
    .filter((event) => !event.allDay)
    .map((event) => ({ event, start: new Date(event.start), end: new Date(event.end) }))
    .filter(({ start, end }) => start.getTime() < dayEnd && end.getTime() > dayStart)
    .map((item) => ({
      ...item,
      top: Math.max(0, item.start.getTime() - dayStart),
      bottom: Math.min(DAY_MS, Math.max(item.end.getTime(), item.start.getTime() + 15 * 60 * 1000) - dayStart),
    }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom)

  // Group events that overlap (directly or through each other), then give each
  // event the first column that's free by the time it starts.
  const placed = []
  let group = []
  let groupEnd = -1
  const finish = () => {
    const columns = Math.max(...group.map((item) => item.column + 1))
    for (const item of group) placed.push({ ...item, columns })
    group = []
  }
  for (const item of items) {
    if (group.length && item.top >= groupEnd) finish()
    const busy = new Set(group.filter((other) => other.bottom > item.top).map((other) => other.column))
    let column = 0
    while (busy.has(column)) column++
    group.push({ ...item, column })
    groupEnd = Math.max(groupEnd, item.bottom)
  }
  if (group.length) finish()
  return placed
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export default function DayView({ events, footer }) {
  const now = useNow()
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const scrollRef = useRef(null)
  const isToday = dateKey(day) === dateKey(now)

  const key = dateKey(day)
  const allDay = events.filter((event) => event.allDay && event.start <= key && key < event.end)
  const timed = layoutDay(events, day)

  // Like Google: today opens at the current time; other days at their first event.
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const firstHour = timed.length ? timed[0].top / (60 * 60 * 1000) : 8
    const focusHour = isToday ? now.getHours() + now.getMinutes() / 60 : firstHour
    element.scrollTop = Math.max(0, (focusHour - 1) * HOUR_HEIGHT)
    // Only when the day changes, not every minute.
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const nowTop = ((now.getTime() - day.getTime()) / (60 * 60 * 1000)) * HOUR_HEIGHT

  return (
    <div className="dayview">
      <div className="dayview-head">
        <button type="button" className="dayview-step" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
          ‹
        </button>
        <div className={`dayview-date${isToday ? ' today' : ''}`}>
          <span className="dayview-weekday">{day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
          <span className="dayview-number">{day.getDate()}</span>
        </div>
        <button type="button" className="dayview-step" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">
          ›
        </button>
        {!isToday && (
          <button type="button" className="dayview-today" onClick={() => setDay(startOfDay(new Date()))}>
            Today
          </button>
        )}
        <span className="dayview-month">{day.toLocaleDateString(undefined, { month: 'long' })}</span>
      </div>

      {allDay.length > 0 && (
        <ul className="dayview-allday">
          {allDay.map((event) => (
            <li key={event.id} style={eventColors(event)}>
              {event.title}
            </li>
          ))}
        </ul>
      )}

      <div className="dayview-scroll" ref={scrollRef}>
        <div className="dayview-grid" style={{ height: 24 * HOUR_HEIGHT }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} className="dayview-hour" style={{ top: hour * HOUR_HEIGHT }}>
              {hour > 0 && (
                <span>
                  {hour % 12 || 12} {hour < 12 ? 'AM' : 'PM'}
                </span>
              )}
            </div>
          ))}
          {timed.map(({ event, start, end, top, bottom, column, columns }) => {
            const height = ((bottom - top) / (60 * 60 * 1000)) * HOUR_HEIGHT
            const short = height < 38
            // Room for a third line (the place) only in taller blocks.
            const roomy = height >= 58
            return (
              <div
                key={event.id}
                className={`dayview-event${short ? ' short' : ''}`}
                style={{
                  ...eventColors(event),
                  top: (top / (60 * 60 * 1000)) * HOUR_HEIGHT,
                  height: Math.max(height - 2, 16),
                  left: `calc(var(--gutter) + (100% - var(--gutter)) * ${column / columns})`,
                  width: `calc((100% - var(--gutter)) / ${columns} - 3px)`,
                }}
                title={`${event.title}\n${timeRange(start, end)}${event.location ? `\n${event.location}` : ''}`}
              >
                <strong>{event.title}</strong>
                {short ? (
                  <span>
                    , {clock(start)}
                    {meridiem(start)}
                  </span>
                ) : (
                  <>
                    <span>{timeRange(start, end)}</span>
                    {roomy && event.location && <span>{event.location}</span>}
                  </>
                )}
              </div>
            )
          })}
          {isToday && <div className="dayview-now" style={{ top: nowTop }} aria-hidden="true" />}
        </div>
      </div>
      {footer}
    </div>
  )
}
