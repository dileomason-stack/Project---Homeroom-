import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// "❓ Guide": a panel on the right with how to use Homeroom and the features
// people tend to miss. Closes on ✕, Esc, or a click outside.
const SECTIONS = [
  {
    title: 'Getting started',
    items: [
      ['Your dashboard', 'Homeroom opens on your own dashboard, saved in this browser. Add cards with “+ Add widget”.'],
      ['See an example', 'Open the ⋯ menu (top right) → “👀 See an example” for Alex’s sample dashboards, a quick tour of what Homeroom can do. They reset every time you reload.'],
      ['Copy a tab you like', 'In the example, click “⧉ Copy this tab” (or right-click a tab → Copy to my dashboards). On a blank dashboard, “🎮 Add the Games tab” adds the arcade in one click.'],
    ],
  },
  {
    title: 'What the badges mean',
    items: [
      ['▶ Use here', 'Works fully right inside the card.'],
      ['👁 Preview', 'Shows it at a glance; click something to open the real app.'],
      ['↗ New tab', 'Sites like Gmail block being shown inside others, so they open in a new tab in one click.'],
    ],
  },
  {
    title: 'Arranging cards',
    items: [
      ['Move', 'Drag a card from any empty spot. Spotify cards move by the gray bar on top.'],
      ['Resize', 'Drag any edge or corner. In the sidebar, drag the gray pills between cards; the one under the last card makes it shorter and leaves empty space.'],
      ['Collapse', 'Hover a card and click − (top left). Click the label to open it again.'],
      ['More options', 'Click ⋯, right-click, or double-click a card: full screen, minimize to the dock, move, color, remove.'],
      ['Between sidebar and workspace', 'Drag a workspace card over the sidebar and let go, or drag a sidebar card out onto the workspace.'],
      ['Hide the sidebar', 'Click “‹ Hide”. Your other cards stretch to fill the screen; “› Sidebar” (top left) brings it back.'],
    ],
  },
  {
    title: 'Shortcuts you might miss',
    items: [
      ['Paste a link (⌘V / Ctrl+V)', 'Anywhere on the page (click an empty spot first): a Spotify, YouTube, Google Doc or website link becomes a card. Sites that block being shown inside others get a preview card that opens them in one click.'],
      ['Drag a link in', 'Drag a link or a browser tab onto the dashboard to add it where you drop it.'],
      ['Add it right here', 'Right-click empty workspace space to add a card at that exact spot.'],
      ['Esc', 'Leaves full screen and closes menus.'],
    ],
  },
  {
    title: 'Connecting your accounts',
    items: [
      ['Canvas', 'In Canvas, open Calendar → “Calendar Feed” (bottom right), copy the link, paste it into the Canvas card.'],
      ['Google Calendar', 'Sign in with Google for your real events and colors: click an empty time (or + New) to add an event, click an event to change or delete it. Or just type your Google email for Google’s own view.'],
      ['Spotify', 'In Spotify, Share → Copy link on a playlist or album. Liked Songs can’t be shared: copy them into a playlist first.'],
      ['Sleeper', 'Type your Sleeper username. Live points and a scoring banner update during games.'],
      ['Google Docs & Drive', 'Share the file as “Anyone with the link”, then paste the link.'],
    ],
  },
  {
    title: 'Make it yours',
    items: [
      ['🎨 Colors', 'Light or dark, color the sidebar or every card, use each app’s own colors, or match your Spotify playlist.'],
      ['Dashboard tabs', 'Click + for a new dashboard from a template. Right-click a tab to rename or delete it.'],
      ['📱 Share (in the ⋯ menu)', 'Shows a QR code so friends can open Homeroom on their phones.'],
    ],
  },
  {
    title: 'Privacy',
    items: [
      ['Saved in your browser', 'Your dashboards, to-dos and links are saved in this browser. There’s nothing to sign up for.'],
      ['Synced when you sign in', 'Signed in with Google (⋯ menu, or the Calendar or Mail card)? Your dashboard also saves to your Google account, so it shows up on any device where you sign in. Sign out any time from the ⋯ menu.'],
      ['Private links', 'Your Canvas feed link is only used to fetch your assignments. It’s never stored on a server.'],
      ['Sign in with Google', 'Calendar and Mail can show your real events and inbox (Mail is read-only; Calendar can add and edit events if you allow it). Google handles the sign-in in its own window; the access it gives lasts about an hour and stays in that browser tab. “Sign out” ends it.'],
    ],
  },
]

export default function GuidePanel({ onClose }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="guide-layer" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="guide-panel" role="dialog" aria-label="How to use Homeroom">
        <header className="guide-head">
          <h2>How to use Homeroom</h2>
          <button type="button" className="guide-close" onClick={onClose} aria-label="Close guide">
            ✕
          </button>
        </header>
        <div className="guide-body">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <dl>
                {section.items.map(([term, text]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
