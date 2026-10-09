import mongoose from 'mongoose'

/**
 * MongoDB Atlas adapter. Same interface as fileStore, so switching between
 * them is just `STORAGE=mongo` + `MONGODB_URI=...` in .env — no code changes.
 */

const reportSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    query: String,
    title: String,
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
  if (!uri) throw new Error('STORAGE=mongo requires MONGODB_URI to be set')
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
  return mongoose.connection.host
}

export async function save(record) {
  const saved = await Report.findOneAndUpdate({ id: record.id }, record, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  }).lean()
  return saved
}

export async function list() {
  const records = await Report.find({}, { report: 0, steps: 0 })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()
  return records.map((r) => ({
    id: r.id,
    query: r.query,
    title: r.title,
    createdAt: r.createdAt,
    status: r.status,
    sourceCount: Array.isArray(r.sources) ? r.sources.length : 0,
  }))
}

export async function get(id) {
  return Report.findOne({ id }).lean()
}

export async function remove(id) {
  const res = await Report.deleteOne({ id })
  return res.deletedCount > 0
}
