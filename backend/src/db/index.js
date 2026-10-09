import config from '../config.js'
import * as fileStore from './fileStore.js'
import * as mongoStore from './mongoStore.js'

/**
 * Storage facade. Import this everywhere instead of the concrete stores —
 * it resolves the right driver once at startup.
 */
const store = config.storage.driver === 'mongo' ? mongoStore : fileStore

export const storageName = store.name

export async function initStorage() {
  if (store.name === 'mongo') {
    const host = await store.connect(config.storage.mongoUri)
    return `mongo (${host})`
  }
  const file = await store.connect()
  return `file (${file})`
}

export const save = (record) => store.save(record)
export const list = () => store.list()
export const get = (id) => store.get(id)
export const remove = (id) => store.remove(id)
