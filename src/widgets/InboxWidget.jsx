import { useEffect, useState } from 'react'
import { openExternal } from '../lib/openExternal.js'
import { connectGoogle, googleFetch, hasScope, SCOPES, useGoogle } from '../lib/google.js'
import { connectMicrosoft, graphFetch, outlookAvailable, useMicrosoft } from '../lib/microsoft.js'
import { useLoader } from '../lib/useFetch.js'
import { useStore, useStoreValue, widgetDataKey } from '../storage.js'
import GoogleSignIn from './GoogleSignIn.jsx'
import { GmailLogo, OutlookLogo } from './appLogos.jsx'

// Gmail and Outlook can't be shown inside other sites, so this card offers
// quick ways in: app-icon tiles that open them in a new tab, compose,
// and search Gmail.
// Alex's example shows a made-up inbox instead. Settings: { sample, read: {id: true} }.
const isSettings = (value) => value && typeof value === 'object'
const NO_SETTINGS = {}

const GMAIL = 'https://mail.google.com/mail/u/0/'
const OUTLOOK = 'https://outlook.office.com/mail/'
const open = openExternal


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

// compose / switcher: small controls shown on the unread line (when the inbox
// is the whole card).
function GmailInbox({ compose, switcher }) {
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
      <div className="inbox-head">
        <p className="inbox-count">
          {data.unread ? `${data.unread} unread` : 'All caught up'} <span>· {google.email ?? 'your inbox'}</span>
        </p>
        {switcher}
        {compose}
      </div>
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

// Your Outlook inbox (read-only), through Microsoft Graph.
async function loadOutlook() {
  const [folder, list] = await Promise.all([
    graphFetch('/me/mailFolders/inbox?$select=unreadItemCount'),
    graphFetch(
      '/me/mailFolders/inbox/messages?$top=12&$orderby=receivedDateTime desc&$select=subject,from,receivedDateTime,isRead,bodyPreview,webLink',
    ),
  ])
  return {
    unread: folder.unreadItemCount ?? 0,
    emails: (list.value ?? []).map((message) => ({
      id: message.id,
      from: message.from?.emailAddress?.name || message.from?.emailAddress?.address || '(unknown sender)',
      subject: message.subject || '(no subject)',
      snippet: message.bodyPreview ?? '',
      time: shortTime(new Date(message.receivedDateTime)),
      unread: !message.isRead,
      link: message.webLink,
    })),
  }
}

function OutlookInbox({ compose, switcher }) {
  const microsoft = useMicrosoft()
  const { data, error, loading, reload } = useLoader(
    microsoft ? `outlook|${microsoft.email}|${microsoft.expiresAt}` : null,
    loadOutlook,
    2 * 60 * 1000,
  )
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
  return (
    <>
      <div className="inbox-head">
        <p className="inbox-count">
          {data.unread ? `${data.unread} unread` : 'All caught up'} <span>· {microsoft.email ?? 'Outlook'}</span>
        </p>
        {switcher}
        {compose}
      </div>
      <ul className="inbox-list">
        {data.emails.map((email) => (
          <li key={email.id}>
            <button type="button" className={email.unread ? undefined : 'read'} onClick={() => email.link && open(email.link)}>
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

// "Show my Outlook inbox", in Microsoft's style.
function MicrosoftSignIn({ label = 'Show my Outlook inbox', compact }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function signIn() {
    setBusy(true)
    setError('')
    try {
      await connectMicrosoft()
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="google-signin">
      <button type="button" className={compact ? 'mail-add-account' : 'google-signin-button'} onClick={signIn} disabled={busy}>
        <svg viewBox="0 0 21 21" aria-hidden="true" width="16" height="16">
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
        {busy ? 'Waiting for Microsoft…' : label}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// Outlook's compose page: outlook.live.com for personal accounts, Office 365
// for school and work accounts.
function outlookCompose(email) {
  const personal = /@(outlook|hotmail|live|msn)\./i.test(email ?? '')
  return personal ? 'https://outlook.live.com/mail/0/deeplink/compose' : 'https://outlook.office.com/mail/deeplink/compose'
}

export default function InboxWidget({ id }) {
  const [settings, setSettings] = useStoreValue(widgetDataKey(id), NO_SETTINGS, isSettings)
  const [query, setQuery] = useState('')
  const [explaining, setExplaining] = useState(false)
  const store = useStore()
  const google = useGoogle()
  const showingGmail = !settings.sample && !store.example
  const gmailConnected = showingGmail && hasScope(google, SCOPES.gmail)
  const microsoft = useMicrosoft()
  const outlookConnected = showingGmail && Boolean(microsoft)
  const read = settings.read ?? {}
  const unread = SAMPLE_EMAILS.filter((email) => !read[email.id]).length

  // With your Gmail connected, the card is just your inbox and a small
  // compose button (the app tiles and search come back if you sign out).
  // The flag also sets the card's badge (see useFor in registry.js).
  useEffect(() => {
    if (gmailConnected !== Boolean(settings.gmail) || outlookConnected !== Boolean(settings.outlook)) {
      setSettings((current) => ({ ...current, gmail: gmailConnected, outlook: outlookConnected }))
    }
  }, [gmailConnected, outlookConnected, settings.gmail, settings.outlook, setSettings])

  if (gmailConnected || outlookConnected) {
    // Both connected: a small Gmail | Outlook switch picks which inbox shows.
    const view = gmailConnected && outlookConnected ? (settings.mailView ?? 'gmail') : gmailConnected ? 'gmail' : 'outlook'
    const switcher =
      gmailConnected && outlookConnected ? (
        <div className="mail-switch" role="tablist" aria-label="Which inbox">
          {[
            ['gmail', 'Gmail'],
            ['outlook', 'Outlook'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              className={view === key ? 'active' : undefined}
              onClick={() => setSettings((current) => ({ ...current, mailView: key }))}
            >
              {label}
            </button>
          ))}
        </div>
      ) : gmailConnected && outlookAvailable() ? (
        <MicrosoftSignIn label="+ Outlook" compact />
      ) : !gmailConnected ? (
        <button type="button" className="mail-add-account" onClick={() => connectGoogle([SCOPES.gmail]).catch(() => {})}>
          + Gmail
        </button>
      ) : null
    const compose = (
      <button
        type="button"
        className="mail-compose-icon"
        onClick={() =>
          open(
            view === 'gmail'
              ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(google.email ?? '')}&view=cm&fs=1`
              : outlookCompose(microsoft?.email),
          )
        }
        title={`Write an email (opens ${view === 'gmail' ? 'Gmail' : 'Outlook'})`}
        aria-label="Write an email"
      >
        ✏️
      </button>
    )
    return (
      <div className="inbox connected">
        {view === 'gmail' ? (
          <GmailInbox compose={compose} switcher={switcher} />
        ) : (
          <OutlookInbox compose={compose} switcher={switcher} />
        )}
      </div>
    )
  }

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
        <>
          <GmailInbox />
          {outlookAvailable() && <MicrosoftSignIn />}
        </>
      ) : null}
    </div>
  )
}
