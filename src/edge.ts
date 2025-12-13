import type { ClearAuthConfig } from "./types.js"
import { handleClearAuthRequest } from "./handler.js"

export {
  createClearAuth,
  defaultSessionConfig,
  longSessionConfig,
  shortSessionConfig,
} from "./createMechAuth.js"
export type { CorsConfig, ClearAuthConfig, OAuthProviderConfig, OAuthProvidersConfig, SessionConfig } from "./types.js"

export async function handleClearAuthEdgeRequest(request: Request, config: ClearAuthConfig): Promise<Response> {
  return await handleClearAuthRequest(request, config)
}
