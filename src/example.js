import { TEMPLATES } from './templates.js'

// Everything a first-time visitor sees: a dashboard for Alex, a fictional
// Cal Poly student. Dates are relative to today, so something is always due
// soon no matter when the demo happens. None of this is saved.

export const EXAMPLE_PERSON = 'Alex Rivera'
export const SAMPLE_CALENDAR_OWNER = 'alex.rivera@gmail.com'

// Local 11:59 PM, `days` from today.
function endOfDay(days, now = new Date()) {
  const date = new Date(now)
  date.setDate(date.getDate() + days)
  date.setHours(23, 59, 0, 0)
  return date
}

function atTime(days, hours, minutes, now = new Date()) {
  const date = new Date(now)
  date.setDate(date.getDate() + days)
  date.setHours(hours, minutes, 0, 0)
  return date
}

export function sampleAssignments(now = new Date()) {
  const items = [
    ['Lab 4: Linked Lists', 'CSC 202', 0],
    ['Reading Quiz: Ch. 6', 'PSY 201', 1],
    ['Problem Set 5', 'MATH 143', 2],
    ['Essay Draft: Rhetorical Analysis', 'ENGL 134', 3],
    ['Midterm Study Guide', 'PSY 201', 5],
    ['Project 1 Proposal', 'CSC 202', 8],
  ]
  return items.map(([title, course, days], index) => ({
    id: `sample-${index}`,
    title,
    course,
    due: endOfDay(days, now).toISOString(),
    allDay: false,
    url: '',
  }))
}

// Alex's calendar from a week ago to three weeks ahead, in the Day view's
// format: MWF and Tue/Thu classes (with rooms), clubs, a few one-offs that
// overlap a class, and Canvas due dates as all-day events.
export function sampleEvents(now = new Date()) {
  const events = []
  const add = (title, days, [h1, m1], [h2, m2], location = '', colors = {}) =>
    events.push({
      id: `event-${events.length}`,
      title,
      location,
      allDay: false,
      start: atTime(days, h1, m1, now).toISOString(),
      end: atTime(days, h2, m2, now).toISOString(),
      ...colors,
    })
  const allDay = (title, days, colors = {}) => {
    const date = atTime(days, 0, 0, now)
    const next = atTime(days + 1, 0, 0, now)
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    events.push({ id: `event-${events.length}`, title, location: '', allDay: true, start: key(date), end: key(next), ...colors })
  }

  for (let days = -7; days <= 21; days++) {
    const weekday = atTime(days, 0, 0, now).getDay()
    if (weekday === 6) add('Farmers market with roommates', days, [10, 0], [12, 0], 'Downtown SLO')
    if (weekday === 0) add('Hike Bishop Peak', days, [9, 0], [11, 0])
    if (weekday === 0 || weekday === 6) continue
    if (weekday % 2 === 1) {
      add('CSC 202 Lecture', days, [9, 10], [10, 0], 'Bldg 14, Rm 256')
      add('MATH 143', days, [11, 10], [12, 0], 'Bldg 38, Rm 121')
      add('Lunch with Sam', days, [12, 10], [13, 0], 'Vista Grande')
    } else {
      add('PSY 201', days, [10, 10], [11, 30], 'Bldg 180, Rm 101')
      add('ENGL 134', days, [13, 40], [15, 0], 'Bldg 22, Rm 208')
      add('Office hours: Prof. Kim', days, [11, 0], [12, 0], 'Bldg 14, Rm 210')
    }
    if (weekday === 2) add('CSC 202 Lab', days, [15, 10], [18, 0], 'Bldg 20, Rm 127')
    if (weekday === 3) add('Study group', days, [16, 0], [17, 30], 'Kennedy Library')
    if (weekday === 4) add('Vibe coding club', days, [18, 0], [19, 0], 'Bldg 186')
    if (weekday === 5) add('Intramural soccer', days, [17, 0], [18, 30], 'Sports Complex')
  }
  // Around right now, so today never looks empty whenever the demo happens:
  // something on now, and something coming up after it.
  const hour = now.getHours()
  const pastel = (color) => ({ color, textColor: '#1f1f1f' })
  add('Study session: CSC 202', 0, [hour, 0], [hour + 1, 30], 'Kennedy Library, 3rd floor', pastel('#b3dc6c'))
  add('Dinner with roommates', 0, [hour + 2, 0], [hour + 3, 0], 'Mustang Village', pastel('#9fe1e7'))
  allDay('Sam’s birthday 🎂', 0, pastel('#9fe1e7'))
  // Canvas due dates (matching the Canvas card).
  allDay('Lab 4: Linked Lists due', 0)
  allDay('Reading Quiz: Ch. 6 due', 1)
  allDay('Problem Set 5 due', 2)
  return events
}

// Lofi Girl's "beats to relax/study to" playlist.
const EXAMPLE_PLAYLIST = 'https://open.spotify.com/playlist/0vvXsWCC9xrXsKd4FyS8kM'

export function exampleSeed() {
  // Alex's 🎮 Fun dashboard is the Fun template with fixed ids.
  const funCount = {}
  const fun = TEMPLATES.fun.build((type) => {
    funCount[type] = (funCount[type] ?? 0) + 1
    return `exf-${type}-${funCount[type]}`
  })
  const funData = Object.fromEntries(Object.entries(fun.data).map(([id, settings]) => [`widget:${id}`, settings]))
  // Alex's example is all white, like the other tabs (a new Fun dashboard made
  // from the template is still dark).
  fun.layout.theme = 'light'

  return {
    // Alex's dashboards.
    dashboards: {
      // Opens on Morning check: the clearest first impression.
      list: [
        { id: 'morning', name: '☀️ Morning check' },
        { id: 'fun', name: '🎮 Fun' },
      ],
      activeId: 'morning',
    },
    // ☀️ Morning check, laid out like a real student's: music, Canvas and the
    // calendar down the sidebar; class notes, search and a scratchpad on top;
    // email, fantasy football and Claude below.
    'layout:morning': {
      theme: 'light',
      sidebarOpen: true,
      sidebarSize: 27,
      sidebar: [
        { id: 'exm-spotify', type: 'spotify' },
        { id: 'exm-canvas', type: 'canvas' },
        { id: 'exm-calendar', type: 'calendar' },
      ],
      sidebarSizes: { 'exm-spotify': 11, 'exm-canvas': 30, 'exm-calendar': 59, 'sidebar-space': 0 },
      workspace: [
        { id: 'exm-doc', type: 'googlefile' },
        { id: 'exm-search', type: 'search' },
        { id: 'exm-notes', type: 'notes' },
        { id: 'exm-mail', type: 'inbox' },
        { id: 'exm-sleeper', type: 'sleeper' },
        { id: 'exm-claude', type: 'claude' },
      ],
      grid: [
        { i: 'exm-doc', x: 0, y: 0, w: 28, h: 60 },
        { i: 'exm-search', x: 28, y: 0, w: 20, h: 28 },
        { i: 'exm-notes', x: 28, y: 28, w: 20, h: 32 },
        { i: 'exm-mail', x: 0, y: 60, w: 20, h: 57 },
        { i: 'exm-sleeper', x: 20, y: 60, w: 14, h: 57 },
        { i: 'exm-claude', x: 34, y: 60, w: 14, h: 57 },
      ],
      gridVersion: 2,
    },
    'widget:exm-canvas': { sample: true, done: {} },
    'widget:exm-spotify': { url: EXAMPLE_PLAYLIST },
    'widget:exm-calendar': { sample: true },
    'widget:exm-mail': { sample: true, read: {} },
    'widget:exm-sleeper': { sample: true },
    'widget:exm-notes':
      'Today\n- Email Prof. Kim about the lab extension\n- Print ENGL essay draft\n- Pay Sam back for pizza ($12.50)\n- Batteries + snacks at Trader Joe’s\n\nThis week\n- Start Project 1 proposal with Maya',
    // Real shared class notes ("Anyone with the link" can view).
    'widget:exm-doc': { url: 'https://docs.google.com/document/d/1SvlWrpX5kxDIx_D9QJfH7iP6KKnoNao-eCAoJJH0-p8/edit' },
    'layout:fun': fun.layout,
    ...funData,
  }
}
