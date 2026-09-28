import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// The box for adding or changing a Google Calendar event: title, all-day,
// date, start and end times, and place. `event` is an existing event (from
// the Day view) or null for a new one starting at `start`. onSave gets the
// Google Calendar API body; onDelete (existing events only) removes it.
const pad = (n) => String(n).padStart(2, '0')
const toDateInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const toTimeInput = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`
const fromDateInput = (text) => {
  const [y, m, d] = text.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDaysTo = (text, days) => {
  const date = fromDateInput(text)
  date.setDate(date.getDate() + days)
  return toDateInput(date)
}

export default function EventEditor({ event, start, onSave, onDelete, onClose }) {
  const initialStart = event ? (event.allDay ? fromDateInput(event.start) : new Date(event.start)) : start
  const initialEnd = event ? (event.allDay ? null : new Date(event.end)) : new Date(start.getTime() + 60 * 60 * 1000)
  // All-day events keep how many days they span.
  const spanDays = event?.allDay ? Math.max(1, Math.round((fromDateInput(event.end) - fromDateInput(event.start)) / 86400000)) : 1

  const [title, setTitle] = useState(event?.title === '(No title)' ? '' : (event?.title ?? ''))
  const [allDay, setAllDay] = useState(Boolean(event?.allDay))
  const [date, setDate] = useState(toDateInput(initialStart))
  const [startTime, setStartTime] = useState(toTimeInput(initialStart))
  const [endTime, setEndTime] = useState(toTimeInput(initialEnd ?? new Date(initialStart.getTime() + 3600000)))
  const [location, setLocation] = useState(event?.location ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const onKey = (key) => key.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      onClose()
    } catch (problem) {
      setError(problem.message)
      setBusy(false)
    }
  }

  function save(submit) {
    submit.preventDefault()
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    let body
    if (allDay) {
      body = { start: { date, dateTime: null }, end: { date: addDaysTo(date, spanDays), dateTime: null } }
    } else {
      const startAt = new Date(`${date}T${startTime}`)
      let endAt = new Date(`${date}T${endTime}`)
      if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86400000) // ends after midnight
      body = {
        start: { dateTime: startAt.toISOString(), timeZone, date: null },
        end: { dateTime: endAt.toISOString(), timeZone, date: null },
      }
    }
    body.summary = title.trim() || '(No title)'
    body.location = location.trim()
    run(() => onSave(body))
  }

  return createPortal(
    <div className="event-layer" onMouseDown={(click) => click.target === click.currentTarget && onClose()}>
      <form className="event-editor" role="dialog" aria-label={event ? 'Edit event' : 'New event'} onSubmit={save}>
        <p className="event-editor-kicker">{event ? 'Edit event' : 'New event'} · Google Calendar</p>
        <input
          className="event-editor-title"
          value={title}
          onChange={(change) => setTitle(change.target.value)}
          placeholder="Add title"
          aria-label="Title"
          autoFocus
        />
        <label className="event-editor-check">
          <input type="checkbox" checked={allDay} onChange={(change) => setAllDay(change.target.checked)} /> All day
        </label>
        <div className="event-editor-row">
          <input type="date" value={date} onChange={(change) => setDate(change.target.value)} aria-label="Date" required />
          {!allDay && (
            <>
              <input
                type="time"
                value={startTime}
                onChange={(change) => setStartTime(change.target.value)}
                aria-label="Starts"
                required
              />
              <span>–</span>
              <input
                type="time"
                value={endTime}
                onChange={(change) => setEndTime(change.target.value)}
                aria-label="Ends"
                required
              />
            </>
          )}
        </div>
        <input
          value={location}
          onChange={(change) => setLocation(change.target.value)}
          placeholder="Add location"
          aria-label="Location"
        />
        {event?.recurring && (
          <p className="setup-note">This is one meeting of a repeating event; changes apply to this one only.</p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="event-editor-actions">
          {event && onDelete && (
            <button
              type="button"
              className={confirmDelete ? 'danger-solid' : 'danger-text'}
              disabled={busy}
              onClick={() => (confirmDelete ? run(onDelete) : setConfirmDelete(true))}
            >
              {confirmDelete ? 'Really delete?' : 'Delete'}
            </button>
          )}
          <span className="event-editor-spacer" />
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
