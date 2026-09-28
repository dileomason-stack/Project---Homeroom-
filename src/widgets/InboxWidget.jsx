import { useState } from 'react'
import { openExternal } from '../lib/openExternal.js'
import { googleFetch, hasScope, SCOPES, useGoogle } from '../lib/google.js'
import { useLoader } from '../lib/useFetch.js'
import { useStore, useStoreValue, widgetDataKey } from '../storage.js'
import GoogleSignIn from './GoogleSignIn.jsx'

// Gmail and Outlook can't be shown inside other sites, so this card offers
// quick ways in: app-icon tiles that open them in a new tab, compose,
// and search Gmail.
// Alex's example shows a made-up inbox instead. Settings: { sample, read: {id: true} }.
const isSettings = (value) => value && typeof value === 'object'
const NO_SETTINGS = {}

const GMAIL = 'https://mail.google.com/mail/u/0/'
const OUTLOOK = 'https://outlook.office.com/mail/'
const open = openExternal

// App-icon style logos, so these read as "opens the app" rather than as
// something that works inside the card.
function GmailLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="11" fill="#fff" />
      <path d="M9 15v20a2 2 0 0 0 2 2h5V22l8 6 8-6v15h5a2 2 0 0 0 2-2V15l-4-3-11 8-11-8z" fill="#ea4335" />
      <path d="M9 15v20a2 2 0 0 0 2 2h5V22z" fill="#4285f4" />
      <path d="M39 15v20a2 2 0 0 1-2 2h-5V22z" fill="#34a853" />
      <path d="M32 22l7-7-4-3-3 2z" fill="#fbbc04" />
      <path d="M16 22L9 15l4-3 3 2z" fill="#c5221f" />
    </svg>
  )
}

function OutlookLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="11" fill="#0a64d6" />
      <rect x="22" y="14" width="18" height="20" rx="2" fill="#5fb2ff" />
      <path d="M22 17l9 6 9-6" fill="none" stroke="#0a64d6" strokeWidth="2" />
      <rect x="8" y="12" width="20" height="24" rx="3" fill="#0f78d4" stroke="#fff" strokeWidth="1.5" />
      <ellipse cx="18" cy="24" rx="5.2" ry="6.5" fill="none" stroke="#fff" strokeWidth="2.6" />
    </svg>
  )
}

const SAMPLE_EMAILS = [
  {
    id: 'e1',
    from: 'Prof. Kim',
    subject: 'CSC 202 Lab 4: extension until Friday',
    snippet: 'Hi all, a few of you asked about the linked list lab…',
    time: '9:12 AM',
  },
  {
    id: 'e2',
    from: 'Canvas',
    subject: 'Reading Quiz: Ch. 6 is due tomorrow',
    snippet: 'PSY 201 · Due Sep 24 at 11:59pm',
    time: '8:30 AM',
  },
  {
    id: 'e3',
    from: 'Vibe Coding Club',
    subject: 'Build Day #1 is Friday! 🎉',
    snippet: 'Doors at 12:00, demos start 12:10 in Frost 181…',
    time: 'Yesterday',
  },
  {
    id: 'e4',
    from: 'Mustang News',
    subject: 'This week at Cal Poly',
    snippet: 'Farmers market returns, new dining hours, and more',
    time: 'Yesterday',
  },
  {
    id: 'e5',
    from: 'Maya (lab partner)',
    subject: 'Re: project proposal',
    snippet: 'Sounds good, I can take the remove() tests if you…',
    time: 'Mon',
  },
]

// Gmail's API returns snippets with HTML entities (&#39; and so on).
function decodeEntities(text) {
  const element = document.createElement('textarea')
  element.innerHTML = text
  return element.value
}

function shortTime(date) {
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (now - date < 6 * 86400000) return date.toLocaleDateString([], { weekday: 'short' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// The newest emails in your inbox (read-only), plus the unread count.
async function loadInbox(google) {
  const base = 'https://gmail.googleapis.com/gmail/v1/users/me'
  const [list, label] = await Promise.all([
    googleFetch(`${base}/messages?labelIds=INBOX&maxResults=12`, google),
    googleFetch(`${base}/labels/INBOX`, google),
  ])
  const messages = await Promise.all(
    (list.messages ?? []).map((message) =>
      googleFetch(
        `${base}/messages/${message.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        google,
      ),
    ),
  )
  const header = (message, name) => message.payload?.headers?.find((item) => item.name.toLowerCase() === name)?.value ?? ''
  return {
    unread: label.messagesUnread ?? 0,
    emails: messages.map((message) => ({
      id: message.id,
      threadId: message.threadId,
      from:
        header(message, 'from')
          .replace(/\s*<[^>]*>\s*$/, '')
          .replace(/^"|"$/g, '') || '(unknown sender)',
      subject: header(message, 'subject') || '(no subject)',
      snippet: decodeEntities(message.snippet ?? ''),
      time: shortTime(new Date(Number(message.internalDate))),
      unread: message.labelIds?.includes('UNREAD'),
    })),
  }
}

function GmailInbox() {
  const google = useGoogle()
  const connected = hasScope(google, SCOPES.gmail)
  const { data, error, loading, reload } = useLoader(
    connected ? `gmail|${google.email}|${google.expiresAt}` : null,
    () => loadInbox(google),
    2 * 60 * 1000,
  )
  if (!connected) {
    return (
      <div className="inbox-connect">
        <GoogleSignIn scopes={[SCOPES.gmail]} label="Show my Gmail inbox" />
        <p className="setup-note">Read-only: Homeroom can see your newest emails but never send, delete or change anything.</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="inbox-connect">
        <p className="form-error">{error}</p>
        <button type="button" onClick={reload}>
          Try again
        </button>
      </div>
    )
  }
  if (loading) return <p className="empty-state">Loading your inbox…</p>
  const gmailLink = (threadId) =>
    `https://mail.google.com/mail/?authuser=${encodeURIComponent(google.email ?? '')}#inbox/${threadId}`
  return (
    <>
      <p className="inbox-count">
        {data.unread ? `${data.unread} unread` : 'All caught up'} <span>· {google.email ?? 'your inbox'}</span>
      </p>
      <ul className="inbox-list">
        {data.emails.map((email) => (
          <li key={email.id}>
            <button type="button" className={email.unread ? undefined : 'read'} onClick={() => open(gmailLink(email.threadId))}>
              <span className="inbox-from">{email.from}</span>
              <span className="inbox-time">{email.time}</span>
              <span className="inbox-subject">{email.subject}</span>
              <span className="inbox-snippet">{email.snippet}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

export default function InboxWidget({ id }) {
  const [settings, setSettings] = useStoreValue(widgetDataKey(id), NO_SETTINGS, isSettings)
  const [query, setQuery] = useState('')
  const [explaining, setExplaining] = useState(false)
  const store = useStore()
  const google = useGoogle()
  const showingGmail = !settings.sample && !store.example
  const gmailConnected = showingGmail && hasScope(google, SCOPES.gmail)
  const read = settings.read ?? {}
  const unread = SAMPLE_EMAILS.filter((email) => !read[email.id]).length

  function search(event) {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed) open(`${GMAIL}#search/${encodeURIComponent(trimmed)}`)
    setQuery('')
  }

  return (
    <div className="inbox">
      <div className="mail-apps">
        <button type="button" className="mail-app" onClick={() => open(`${GMAIL}#inbox`)} title="Open Gmail in a new tab">
          <GmailLogo />
          <span>
            <strong>Gmail</strong>
            <small>Opens in new tab ↗</small>
          </span>
        </button>
        <button
          type="button"
          className="mail-app"
          onClick={() => open(OUTLOOK)}
          title="Open Outlook (Cal Poly email) in a new tab"
        >
          <OutlookLogo />
          <span>
            <strong>Outlook</strong>
            <small>Opens in new tab ↗</small>
          </span>
        </button>
        <button
          type="button"
          className="mail-compose"
          onClick={() => open('https://mail.google.com/mail/?view=cm&fs=1')}
          title="Write a new Gmail message"
        >
          ✏️ Compose
        </button>
      </div>
      {!gmailConnected && (
        <p className="mail-why">
          🔒 Gmail’s and Outlook’s websites can’t be shown inside other sites, so they open in a new tab.{' '}
          {showingGmail && 'Sign in below to see your Gmail inbox here. '}
          <button
            type="button"
            className="mail-why-toggle"
            onClick={() => setExplaining(!explaining)}
            aria-expanded={explaining}
            aria-label="Why can't my inbox show here?"
            title="Why can't my inbox show here?"
          >
            ?
          </button>
        </p>
      )}
      {explaining && (
        <div className="mail-explain">
          <p>
            <strong>Why not?</strong> Gmail and Outlook tell browsers never to show them inside another website, even when you’re
            signed in. It’s a security rule, so no page can quietly load your email.
          </p>
          <p>
            <strong>So how does my inbox show?</strong> Through “Sign in with Google” and Gmail’s official email API, read-only:
          </p>
          <ul>
            <li>
              <b>Gmail:</b> works now for accounts on Homeroom’s test list. Google treats reading email as a restricted
              permission, so opening it to everyone needs Google’s verification and an independent security review.
            </li>
            <li>
              <b>Outlook:</b> the app is registered with Microsoft, and for school accounts like Cal Poly’s, the school’s IT may
              need to approve it.
            </li>
          </ul>
          <p>Outlook sign-in is next on the list.</p>
        </div>
      )}
      <form className="inline-form" onSubmit={search}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Gmail…"
          aria-label="Search Gmail"
        />
      </form>

      {settings.sample ? (
        <>
          <p className="inbox-count">
            {unread ? `${unread} unread` : 'All caught up'} <span>· sample inbox (made-up emails)</span>
          </p>
          <ul className="inbox-list">
            {SAMPLE_EMAILS.map((email) => (
              <li key={email.id}>
                <button
                  type="button"
                  className={read[email.id] ? 'read' : undefined}
                  onClick={() => setSettings((current) => ({ ...current, read: { ...current.read, [email.id]: true } }))}
                >
                  <span className="inbox-from">{email.from}</span>
                  <span className="inbox-time">{email.time}</span>
                  <span className="inbox-subject">{email.subject}</span>
                  <span className="inbox-snippet">{email.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : showingGmail ? (
        <GmailInbox />
      ) : null}
    </div>
  )
}
