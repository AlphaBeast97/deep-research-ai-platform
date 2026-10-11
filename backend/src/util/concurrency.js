/**
 * Run a worker over a list with a bounded number of jobs in flight.
 *
 * The research sub-questions are independent, so doing them one at a time spends
 * most of the run waiting on the network. This keeps the result order aligned
 * with the input order (the report is written in plan order) while overlapping
 * the waiting.
 *
 * On the first failure the pool stops claiming new work and rethrows that error;
 * in-flight jobs are awaited so a stop does not leave stray writes behind.
 */
export async function mapConcurrent(items, limit, worker) {
  const list = Array.isArray(items) ? items : []
  const results = new Array(list.length)
  const width = Math.max(1, Math.min(Math.max(1, limit), list.length || 1))

  let next = 0
  let failure = null

  const run = async () => {
    while (!failure) {
      const index = next++
      if (index >= list.length) return
      try {
        results[index] = await worker(list[index], index)
      } catch (err) {
        failure = failure || err
        return
      }
    }
  }

  await Promise.all(Array.from({ length: width }, run))
  if (failure) throw failure
  return results
}
