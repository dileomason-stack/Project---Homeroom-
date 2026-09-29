import { GmailLogo, OutlookLogo } from './appLogos.jsx'
import { CanvasIcon, DriveIcon } from './icons.jsx'

// The apps an App shortcut card can open (see ShortcutWidget.jsx).
export const favicon = (url) => `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=128`

export const SHORTCUT_APPS = {
  outlook: { title: 'Outlook', url: 'https://outlook.office.com/mail/', Logo: OutlookLogo },
  gmail: { title: 'Gmail', url: 'https://mail.google.com/mail/u/0/', Logo: GmailLogo },
  canvas: { title: 'Canvas', url: 'https://canvas.calpoly.edu', Logo: CanvasIcon },
  drive: { title: 'Google Drive', url: 'https://drive.google.com', Logo: DriveIcon },
  portal: { title: 'Cal Poly Portal', url: 'https://my.calpoly.edu' },
}

// The app a card points to: { title, url, Logo? }.
export function shortcutFor(settings) {
  if (SHORTCUT_APPS[settings?.app]) return SHORTCUT_APPS[settings.app]
  if (settings?.url) return { title: settings.title || new URL(settings.url).hostname.replace(/^www\./, ''), url: settings.url }
  return null
}
