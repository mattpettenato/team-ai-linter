// Positive + negative cases for the real cspell-backed spell checker.
import * as spellNs from '../../src/services/detection/spellChecker'

type SpellModule = { spellCheckFile: (content: string) => Promise<Array<{ line: number; word: string }>> }
const { spellCheckFile }: SpellModule =
  (spellNs as unknown as { default?: SpellModule }).default ?? (spellNs as unknown as SpellModule)

let failed = 0
function record(name: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !detail ? '' : `\n        ${detail}`}`)
  if (!pass) failed++
}

// Positive: an unambiguous misspelling in a test title must be flagged.
{
  const issues = await spellCheckFile(`test('user can naviagte to dashbaord', async () => {})\n`)
  const words = issues.map(i => i.word.toLowerCase())
  record('spellcheck: flags "naviagte"', words.includes('naviagte'), `words=${JSON.stringify(words)}`)
  record('spellcheck: flags "dashbaord"', words.includes('dashbaord'), `words=${JSON.stringify(words)}`)
}

// Negative: clean content plus domain terms must stay silent.
{
  const issues = await spellCheckFile(`test('user can navigate to dashboard', async () => {\n  await checksumAI('click login')\n})\n`)
  record('spellcheck: silent on clean content', issues.length === 0, `issues=${JSON.stringify(issues)}`)
}

process.exit(failed === 0 ? 0 : 1)
