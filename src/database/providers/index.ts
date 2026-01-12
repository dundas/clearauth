/**
 * Database provider adapters for ClearAuth
 *
 * This module exports Kysely adapters for various database providers,
 * allowing ClearAuth to work with different database backends in edge environments.
 */

// Mech Storage (default)
export { createMechKysely } from "../../mech-kysely.js"
export type { MechKyselyConfig } from "../../mech-kysely.js"

// Neon PostgreSQL
export { createNeonKysely } from "./neon.js"
export type { NeonKyselyConfig } from "./neon.js"

// Turso (libSQL)
export { createTursoKysely } from "./turso.js"
export type { TursoKyselyConfig } from "./turso.js"

// Cloudflare D1
export { createD1Kysely } from "./d1.js"
export type { D1KyselyConfig, D1Database } from "./d1.js"

// PlanetScale MySQL
export { createPlanetScaleKysely } from "./planetscale.js"
export type { PlanetScaleKyselyConfig } from "./planetscale.js"

// Supabase PostgreSQL
export { createSupabaseKysely } from "./supabase.js"
export type { SupabaseKyselyConfig } from "./supabase.js"
