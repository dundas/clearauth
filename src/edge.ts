import type { MechAuthConfig } from "./types.js"
import { handleMechAuthRequest } from "./handler.js"

export { createMechAuth, defaultSessionConfig, longSessionConfig, shortSessionConfig } from "./createMechAuth.js"
export type { CorsConfig, MechAuthConfig, OAuthProviderConfig, OAuthProvidersConfig, SessionConfig } from "./types.js"

export async function handleLightAuthEdgeRequest(request: Request, config: MechAuthConfig): Promise<Response> {
  return await handleMechAuthRequest(request, config)
}
