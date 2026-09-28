import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// On Vercel, files in api/ become serverless functions automatically. This
// plugin does the same for `npm run dev`, so /api/* works locally too.
// Each api file exports handlers named after HTTP methods: export function POST(request).
function vercelApiInDev() {
  return {
    name: 'vercel-api-in-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/([a-z0-9-]+)(?:\?|$)/)
        if (!match) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.js`)
          const handler = mod[req.method]
          if (typeof handler !== 'function') {
            res.statusCode = 405
            return res.end()
          }
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const hasBody = !['GET', 'HEAD'].includes(req.method)
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            // Pass along the headers api files read (sign-in token, cookie).
            headers: Object.fromEntries(
              ['content-type', 'authorization', 'cookie'].filter((name) => req.headers[name]).map((name) => [name, req.headers[name]]),
            ),
            body: hasBody ? Buffer.concat(chunks) : undefined,
          })
          const response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          console.error(error)
          res.statusCode = 500
          res.end('API error (see terminal)')
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), vercelApiInDev()],
})
