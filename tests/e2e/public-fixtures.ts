import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function loadPublicJson<T>(path: string): Promise<T> {
  const contents = await readFile(join(process.cwd(), 'public', 'data', path), 'utf8')
  return JSON.parse(contents) as T
}
