/**
 * Device Registration and Management
 *
 * Functions for managing registered devices:
 * - List user's devices
 * - Revoke devices
 * - Track device usage
 *
 * @module device-auth/device-registration
 */

import type { Kysely } from 'kysely'
import type { Database } from '../database/schema.js'
import type { DeviceInfo } from './types.js'
import { toDeviceInfo } from './types.js'

/**
 * Options for listing devices
 */
export interface ListDevicesOptions {
  /** Maximum number of devices to return (default: 50) */
  limit?: number
  /** Number of devices to skip (default: 0) */
  offset?: number
}

/**
 * Shared helper to sort devices by usage and registration date
 * Recently used first, never-used last. Ties broken by registration date.
 * 
 * @internal
 */
function sortDevicesByUsage(devices: any[]): any[] {
  return [...devices].sort((a, b) => {
    // 1. Sort by last_used_at (descending, nulls last)
    const timeA = a.last_used_at ? new Date(a.last_used_at).getTime() : -1
    const timeB = b.last_used_at ? new Date(b.last_used_at).getTime() : -1
    
    if (timeA !== timeB) {
      return timeB - timeA
    }

    // 2. Sort by registered_at (descending) as tie-breaker
    const regA = new Date(a.registered_at).getTime()
    const regB = new Date(b.registered_at).getTime()
    return regB - regA
  })
}

/**
 * List all devices for a user
 *
 * Returns all devices (active and revoked) for the given user.
 * Devices are sorted by last_used_at (most recent first), with
 * never-used devices at the end sorted by registered_at.
 *
 * @param db - Kysely database instance
 * @param userId - User ID to list devices for
 * @param options - Pagination options
 * @returns Array of device information
 *
 * @example
 * ```typescript
 * const devices = await listUserDevices(db, 'user-123', { limit: 10 })
 * ```
 */
export async function listUserDevices(
  db: Kysely<Database>,
  userId: string,
  options: ListDevicesOptions = {}
): Promise<DeviceInfo[]> {
  const limit = options.limit ?? 50
  const offset = options.offset ?? 0

  const devices = await db
    .selectFrom('devices')
    .selectAll()
    .where('user_id', '=', userId)
    .limit(limit)
    .offset(offset)
    .execute()

  return sortDevicesByUsage(devices).map(toDeviceInfo)
}

/**
 * List only active devices for a user
 *
 * Returns only devices with status='active'. Useful for display
 * purposes where revoked devices should be hidden.
 *
 * @param db - Kysely database instance
 * @param userId - User ID to list devices for
 * @param options - Pagination options
 * @returns Array of active device information
 */
export async function listActiveDevices(
  db: Kysely<Database>,
  userId: string,
  options: ListDevicesOptions = {}
): Promise<DeviceInfo[]> {
  const limit = options.limit ?? 50
  const offset = options.offset ?? 0

  const devices = await db
    .selectFrom('devices')
    .selectAll()
    .where('user_id', '=', userId)
    .where('status', '=', 'active')
    .limit(limit)
    .offset(offset)
    .execute()

  return sortDevicesByUsage(devices).map(toDeviceInfo)
}

/**
 * Get a specific device by device ID
 *
 * Returns device information if it exists and belongs to the user.
 *
 * @param db - Kysely database instance
 * @param deviceId - Device ID to retrieve
 * @param userId - User ID that owns the device
 * @returns Device information or null if not found
 */
export async function getDevice(
  db: Kysely<Database>,
  deviceId: string,
  userId: string
): Promise<DeviceInfo | null> {
  const device = await db
    .selectFrom('devices')
    .selectAll()
    .where('device_id', '=', deviceId)
    .where('user_id', '=', userId)
    .executeTakeFirst()

  return device ? toDeviceInfo(device) : null
}

/**
 * Revoke a device
 *
 * Sets device status to 'revoked'. Revoked devices cannot be used
 * for authentication but remain in the database for audit trail.
 *
 * @param db - Kysely database instance
 * @param deviceId - Device ID to revoke
 * @param userId - User ID that owns the device (for authorization)
 * @returns True if device was revoked, false if not found or already revoked
 */
export async function revokeDevice(
  db: Kysely<Database>,
  deviceId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .updateTable('devices')
    .set({ status: 'revoked' })
    .where('device_id', '=', deviceId)
    .where('user_id', '=', userId)
    .where('status', '=', 'active') // Only revoke active devices
    .executeTakeFirst()

  return (result.numUpdatedRows ?? 0n) > 0n
}

/**
 * Update last_used_at timestamp for a device
 *
 * Called after successful device authentication to track
 * when the device was last used.
 *
 * @param db - Kysely database instance
 * @param deviceId - Device ID to update
 * @returns True if timestamp was updated, false if device not found
 */
export async function updateDeviceLastUsed(
  db: Kysely<Database>,
  deviceId: string
): Promise<boolean> {
  const result = await db
    .updateTable('devices')
    .set({ last_used_at: new Date() })
    .where('device_id', '=', deviceId)
    .executeTakeFirst()

  return (result.numUpdatedRows ?? 0n) > 0n
}