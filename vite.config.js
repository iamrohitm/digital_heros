import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Local-only helper: runs the files in /api (Vercel-style serverless functions) inside `npm run dev`,
// so you don't need `vercel dev`. On Vercel itself these files run natively.
function apiDev() {
  return {
    name: 'api-dev',
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', process.cwd(), ''))
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next()
        const name = req.url.split('?')[0].replace('/api/', '')
        if (!/^[a-z]+$/.test(name)) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          if (mod.config?.api?.bodyParser !== false) {
            const chunks = []
            for await (const c of req) chunks.push(c)
            const raw = Buffer.concat(chunks).toString()
            try { req.body = raw ? JSON.parse(raw) : {} } catch { req.body = {} }
          }
          res.status = (c) => { res.statusCode = c; return res }
          res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)) }
          res.send = (s) => res.end(s)
          await mod.default(req, res)
        } catch (e) {
          console.error(e)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e.message }))
        }
      })
    },
  }
}

export default defineConfig({ plugins: [react(), apiDev()] })
