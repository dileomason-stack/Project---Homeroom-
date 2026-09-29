// App-icon style logos, so these read as "opens the app" rather than as
// something that works inside the card.
export function GmailLogo() {
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

export function OutlookLogo() {
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
