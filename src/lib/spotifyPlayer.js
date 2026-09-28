// Spotify's player only fills its frame at 80px (compact), 152px (standard)
// or 352px and taller (with the track list); in between it leaves an empty
// band. So the frame uses the tallest of those that fits the card.
export const SPOTIFY_FILL_HEIGHTS = [80, 152, 352]

export function playerHeight(space) {
  if (space >= SPOTIFY_FILL_HEIGHTS[2]) return space
  if (space >= SPOTIFY_FILL_HEIGHTS[1]) return SPOTIFY_FILL_HEIGHTS[1]
  return SPOTIFY_FILL_HEIGHTS[0]
}
