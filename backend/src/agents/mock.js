/**
 * Mock data for the whole pipeline.
 *
 * Mock mode lets the app run end-to-end before any credentials are supplied
 * (no LLM, no search key). Every value here is obviously synthetic and is
 * surfaced to the UI with a `mock: true` flag so it is never mistaken for real
 * research.
 *
 * The fixtures deliberately exercise the interesting paths: the first
 * sub-question reports low coverage so a gap-filling round fires, and the critic
 * returns a non-solid verdict so the revision pass is demonstrated too.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function mockPlan(query) {
  return {
    title: `${query} — Mock Research Report`,
    scope: `A simulated long-form report on “${query}”. Produced without network or model access, so nothing here is real research.`,
    subQuestions: [
      {
        question: `What is the current state of ${query}?`,
        intent: 'Establish baseline.',
        theme: 'Current state',
      },
      {
        question: `What are the main approaches to ${query}?`,
        intent: 'Survey options.',
        theme: 'Approaches',
      },
      {
        question: `What are the risks and trade-offs of ${query}?`,
        intent: 'Assess downsides.',
        theme: 'Risks',
      },
    ],
  }
}

export function mockExtraction(question, sources, coverage = 75) {
  return {
    question,
    summary: `Placeholder synthesis for “${question}” based on ${sources.length} mock source(s). Add real API keys to get grounded findings.`,
    coverage,
    findings: sources.map((s) => ({
      point: `Mock finding derived from “${s.title}”.`,
      cites: [s.index],
      confidence: 'low',
    })),
    gaps:
      coverage < 60
        ? ['Mock mode cannot surface real gaps — supply API keys to close this.']
        : [],
  }
}

/** Canned gap-filling queries so the follow-up round is visible in mock mode. */
export function mockFollowUps(question, alreadyAsked = []) {
  const proposed = [
    `official data ${question}`,
    `${question} primary source analysis`,
  ].filter((q) => !alreadyAsked.some((a) => a.toLowerCase() === q.toLowerCase()))

  return {
    queries: proposed.slice(0, 2),
    reason: 'Mock mode always proposes one more round to demonstrate gap-filling.',
  }
}

/** A non-solid critique so the revision pass runs in mock mode. */
export function mockCritique() {
  return {
    verdict: 'minor-issues',
    issues: [
      {
        type: 'uncited',
        severity: 'medium',
        claim: '“This placeholder report demonstrates the full streaming pipeline”',
        problem: 'Mock draft: the sentence carries no citation.',
        fix: 'Attach the source that supports it, or state it as a limitation.',
      },
      {
        type: 'missing-angle',
        severity: 'low',
        claim: 'No comparison section',
        problem: 'Mock draft: no table comparing the options.',
        fix: 'Add a comparison table built from the findings.',
      },
    ],
    citationProblems: [],
    recommendations: [
      'Add a comparison table.',
      'Cite the opening claim.',
      'Keep the Mermaid diagram.',
    ],
  }
}

/** Streams a canned draft report word-by-word so the UI behaves like live output. */
export async function mockDraft({ plan, research, sources, emit }) {
  const lines = [
    `# ${plan.title}`,
    '',
    '> **Mock mode.** No LLM API key / `TAVILY_API_KEY` detected, so this',
    '> report is generated from canned data. Add your keys to `backend/.env`',
    '> and restart the server for real research.',
    '',
    '## Scope & method',
    '',
    `Simulated investigation of “${plan.title}” across ${plan.subQuestions.length} sub-questions and ${sources.length} placeholder sources.`,
    '',
    '## Executive summary',
    '',
    '- The pipeline streams planning, research, synthesis, critique and revision separately [1].',
    '- Every stage is observable while it runs [1].',
    '',
    '```mermaid',
    'flowchart LR',
    '  A["Planner"] --> B["Researcher"]',
    '  B --> C["Writer draft"]',
    '  C --> D["Critic"]',
    '  D --> E["Reviser"]',
    '```',
    '',
    '## Findings',
    '',
    ...research.flatMap((r, i) => [
      `### ${i + 1}. ${r.question}`,
      '',
      r.summary,
      '',
      ...r.findings.map(
        (f) => `- ${f.point} ${f.cites.map((c) => `[${c}]`).join('')}`,
      ),
      '',
    ]),
    '## Where the evidence conflicts',
    '',
    '- Mock sources never disagree — there is no real evidence here to conflict.',
    '',
    '## Limitations & open questions',
    '',
    '- This is simulated content produced without network or model calls.',
    '- Add real credentials to replace every section above with grounded research.',
    '',
  ]

  return streamText(lines.join('\n'), emit)
}

/** Streams the revised mock report, labelled to distinguish it from the draft. */
export async function mockRevision({ plan, research, sources, emit }) {
  const lines = [
    `# ${plan.title}`,
    '',
    '> **Mock mode (revised).** No LLM API key / `TAVILY_API_KEY` detected, so this',
    '> report is generated from canned data. Add your keys to `backend/.env`',
    '> and restart the server for real research.',
    '',
    '## Scope & method',
    '',
    `Simulated investigation of “${plan.title}” across ${plan.subQuestions.length} sub-questions and ${sources.length} placeholder sources.`,
    '',
    '## Executive summary',
    '',
    '- The pipeline streams planning, research, synthesis, critique and revision separately [1].',
    '- The critique pass names each issue before the revision is written [1].',
    '',
    '## Comparison',
    '',
    '| Stage | Agent | Streamed |',
    '| --- | --- | --- |',
    '| Planning | Planner | yes |',
    '| Research | Researcher | yes |',
    '| Draft | Writer | yes |',
    '| Audit | Critic | no |',
    '| Revision | Writer | yes |',
    '',
    '```mermaid',
    'flowchart LR',
    '  A["Planner"] --> B["Researcher"]',
    '  B --> C["Writer draft"]',
    '  C --> D["Critic"]',
    '  D --> E["Reviser"]',
    '  E --> F["Cited report"]',
    '```',
    '',
    '## Findings',
    '',
    ...research.flatMap((r, i) => [
      `### ${i + 1}. ${r.question}`,
      '',
      r.summary,
      '',
      ...r.findings.map(
        (f) => `- ${f.point} ${f.cites.map((c) => `[${c}]`).join('')}`,
      ),
      '',
    ]),
    '## Where the evidence conflicts',
    '',
    '- Mock sources never disagree — there is no real evidence here to conflict.',
    '',
    '## Confidence & evidence quality',
    '',
    '- All findings are low-confidence: they come from canned data [1].',
    '',
    '## Limitations & open questions',
    '',
    '- This is simulated content produced without network or model calls.',
    '- Add real credentials to replace every section above with grounded research.',
    '',
  ]

  return streamText(lines.join('\n'), emit)
}

async function streamText(text, emit) {
  for (const chunk of text.match(/\S+\s*/g) || []) {
    emit({ type: 'token', text: chunk })
    await sleep(8)
  }
  return text
}
