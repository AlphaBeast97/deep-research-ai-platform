import mongoose from 'mongoose'

/**
 * MongoDB Atlas adapter. Every report carries the Clerk `ownerId` of the user
 * who ran it, and every query is scoped to that id — history is private.
 */

const reportSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    // Clerk user id (e.g. "user_2abc..."). Required: an ownerless report could
    // never be listed or reopened, so it should never be written.
    ownerId: { type: String, required: true, index: true },
    query: String,
    title: String,
    // Which deliverable the user asked for (see agents/reportTypes.js).
    reportType: String,
    scope: String,
    status: String,
    createdAt: { type: Date, default: Date.now },
    durationMs: Number,
    subQuestions: [String],
    themes: [String],
    sources: [
      {
        id: String,
        index: Number,
        title: String,
        url: String,
        snippet: String,
        subQuestion: String,
        score: Number,
      },
    ],
    // The researcher's extractions: summary, coverage, findings, gaps.
    research: mongoose.Schema.Types.Mixed,
    report: String,
    // The critic's structured audit, and the mechanical citation audit.
    critique: mongoose.Schema.Types.Mixed,
    audit: mongoose.Schema.Types.Mixed,
    revised: Boolean,
    // Why the accepted revision is not the one that shipped (empty, citation-free,
    // structure-free, lost most of the draft's figures), if it was rejected.
    revisionRejected: String,
    // Set on a run that stopped or failed part-way through; `status` says which.
    error: String,
    searchRounds: Number,
    phases: [
      {
        phase: String,
        ms: Number,
      },
    ],
    steps: [
      {
        agent: String,
        label: String,
        detail: String,
        // 'start' | 'done'. The trace uses `start` to mark the step still in
        // progress, so a schema that dropped it made a reopened report render
        // every step as finished.
        status: String,
        at: String,
      },
    ],
    usage: {
      promptTokens: Number,
      completionTokens: Number,
      totalTokens: Number,
    },
  },
  { timestamps: true },
)

const Report = mongoose.models.Report || mongoose.model('Report', reportSchema)

export const name = 'mongo'

export async function connect(uri) {
  if (!uri) throw new Error('MONGODB_URI is not set')
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
  return mongoose.connection.host
}

export async function save(record) {
  if (!record.ownerId) throw new Error('Refusing to save a report without an ownerId')
  const saved = await Report.findOneAndUpdate({ id: record.id }, record, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  }).lean()
  return saved
}

export async function list(ownerId) {
  // The history list wants a source *count*, not the sources: projecting `$size`
  // keeps a long report's titles, URLs and snippets out of the response.
  return Report.aggregate([
    { $match: { ownerId } },
    { $sort: { createdAt: -1 } },
    { $limit: 100 },
    {
      $project: {
        _id: 0,
        id: 1,
        query: 1,
        title: 1,
        createdAt: 1,
        status: 1,
        sourceCount: { $size: { $ifNull: ['$sources', []] } },
      },
    },
  ])
}

export async function get(id, ownerId) {
  return Report.findOne({ id, ownerId }).lean()
}

export async function remove(id, ownerId) {
  const res = await Report.deleteOne({ id, ownerId })
  return res.deletedCount > 0
}
