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
 * List all devices for a user
 *
 * Returns all devices (active and revoked) for the given user.
 * Devices are sorted by last_used_at (most recent first), with
 * never-used devices at the end sorted by registered_at.
 *
 * @param db - Kysely database instance
 * @param userId - User ID to list devices for
 * @returns Array of device information
 *
 * @example
 * ```typescript
 * const devices = await listUserDevices(db, 'user-123')
 * console.log(`User has ${devices.length} devices`)
 * ```
 */
export async function listUserDevices(
  db: Kysely<Database>,
  userId: string
): Promise<DeviceInfo[]> {
  const devices = await db
    .selectFrom('devices')
    .selectAll()
    .where('user_id', '=', userId)
    .execute()

  // Sort in JavaScript to handle NULLs consistently across DBs
  // We want NULL last_used_at to be at the bottom
  const sortedDevices = devices.sort((a, b) => {
    // 1. Sort by last_used_at (descending, nulls last)
    const timeA = a.last_used_at ? new Date(a.last_used_at).getTime() : -1
    const timeB = b.last_used_at ? new Date(b.last_used_at).getTime() : -1
    
    // If timestamps are different (and at least one is not null/new)
    if (timeA !== timeB) {
      // If both are valid times, simple desc sort
      if (timeA !== -1 && timeB !== -1) {
        return timeB - timeA
      }
      // If one is null (-1), put it last
      // valid time (high number) vs -1 -> valid comes first
      return timeB - timeA 
    }

    // 2. Sort by registered_at (descending) as tie-breaker
    const regA = new Date(a.registered_at).getTime()
    const regB = new Date(b.registered_at).getTime()
    return regB - regA
  })

  return sortedDevices.map(toDeviceInfo)
}

/**
 * List only active devices for a user
 *
 * Returns only devices with status='active'. Useful for display
 * purposes where revoked devices should be hidden.
 *
 * @param db - Kysely database instance
 * @param userId - User ID to list devices for
 * @returns Array of active device information
 *
 * @example
 * ```typescript
 * const activeDevices = await listActiveDevices(db, 'user-123')
 * ```
 */
export async function listActiveDevices(
  db: Kysely<Database>,
  userId: string
): Promise<DeviceInfo[]> {
  const devices = await db
    .selectFrom('devices')
    .selectAll()
    .where('user_id', '=', userId)
    .where('status', '=', 'active')
    .execute()

  // Sort in JavaScript to handle NULLs consistently across DBs
  const sortedDevices = devices.sort((a, b) => {
    // 1. Sort by last_used_at (descending, nulls last)
    const timeA = a.last_used_at ? new Date(a.last_used_at).getTime() : -1
    const timeB = b.last_used_at ? new Date(b.last_used_at).getTime() : -1
    
    if (timeA !== timeB) {
      return timeB - timeA
    }

    // 2. Sort by registered_at (descending)
    const regA = new Date(a.registered_at).getTime()
    const regB = new Date(b.registered_at).getTime()
    return regB - regA
  })

  return sortedDevices.map(toDeviceInfo)
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
 *
 * @example
 * ```typescript
 * const device = await getDevice(db, 'dev_web3_abc123', 'user-123')
 * if (device) {
 *   console.log(`Device platform: ${device.platform}`)
 * }
 * ```
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
 * This is a soft delete - the device record is preserved with
 * status='revoked' rather than being deleted from the database.
 *
 * @param db - Kysely database instance
 * @param deviceId - Device ID to revoke
 * @param userId - User ID that owns the device (for authorization)
 * @returns True if device was revoked, false if not found or already revoked
 *
 * @example
 * ```typescript
 * const revoked = await revokeDevice(db, 'dev_web3_abc123', 'user-123')
 * if (revoked) {
 *   console.log('Device successfully revoked')
 * } else {
 *   console.log('Device not found or already revoked')
 * }
 * ```
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
 * when the device was last used. This helps users identify
 * stale or compromised devices.
 *
 * @param db - Kysely database instance
 * @param deviceId - Device ID to update
 * @returns True if timestamp was updated, false if device not found
 *
 * @example
 * ```typescript
 * await updateDeviceLastUsed(db, 'dev_web3_abc123')
 * ```
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
