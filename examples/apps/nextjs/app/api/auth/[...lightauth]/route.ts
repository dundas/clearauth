import { handleMechAuthRequest } from 'lightauth'

import { authConfig } from '../../../../lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return await handleMechAuthRequest(request, authConfig)
}

export async function POST(request: Request) {
  return await handleMechAuthRequest(request, authConfig)
}
