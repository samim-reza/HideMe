// Worker entry point. The Workers runtime only allows handlers to be exported
// from this file, so all logic lives in app.ts.
import { handle, type Env } from './app'

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, env)
  },
} satisfies ExportedHandler<Env>
