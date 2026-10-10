import config from '../config.js'
import * as mongoStore from './mongoStore.js'

/**
 * Storage facade. MongoDB is the only driver — import this everywhere instead
 * of the store itself so the driver choice stays in one place.
 *
 * Every read/write is scoped to a Clerk `userId`; a report belongs to exactly
 * one user, so ownership is enforced by the query rather than by the caller.
 */
export const storageName = mongoStore.name

export async function initStorage() {
  const host = await mongoStore.connect(config.mongo.uri)
  return `mongo (${host})`
}

export const save = (record) => mongoStore.save(record)
export const list = (ownerId) => mongoStore.list(ownerId)
export const get = (id, ownerId) => mongoStore.get(id, ownerId)
export const remove = (id, ownerId) => mongoStore.remove(id, ownerId)
