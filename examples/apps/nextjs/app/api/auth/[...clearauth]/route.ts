import { handleClearAuthRequest } from 'clearauth'

import { authConfig } from '../../../../lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return await handleClearAuthRequest(request, authConfig)
}

export async function POST(request: Request) {
  return await handleClearAuthRequest(request, authConfig)
}
