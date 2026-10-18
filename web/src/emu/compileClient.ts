export interface Diagnostic {
  line: number
  column?: number
  severity: 'error' | 'warning'
  message: string
}

export interface CompileSize {
  flash: number
  ram: number
  flashMax: number
  ramMax: number
}

export type CompileResponse =
  | { ok: true; hex: string; size: CompileSize; cached: boolean }
  | {
      ok: false
      /** rejected/compile: the sketch is at fault. The rest are about the service or the connection. */
      reason: 'rejected' | 'compile' | 'timeout' | 'busy' | 'unavailable' | 'rate_limited' | 'network'
      diagnostics: Diagnostic[]
      message?: string
    }

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function diagnostics(raw: unknown): Diagnostic[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((d): Diagnostic[] =>
    isRecord(d) && typeof d.line === 'number' && typeof d.message === 'string'
      ? [{ line: Math.max(1, Math.floor(d.line)), ...(typeof d.column === 'number' ? { column: d.column } : {}), severity: d.severity === 'warning' ? 'warning' : 'error', message: d.message }]
      : [],
  )
}

const fail = (reason: Extract<CompileResponse, { ok: false }>['reason'], message: string): CompileResponse => ({ ok: false, reason, diagnostics: [], message })

/** Sends a sketch to the server's compile service and returns the firmware or the problems found. Never throws. */
export async function compileSketch(code: string, signal?: AbortSignal): Promise<CompileResponse> {
  let res: Response
  try {
    res = await fetch(`${API}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, board: 'uno' }),
      signal,
    })
  } catch {
    return fail('network', 'Server kompilasi tidak bisa dihubungi')
  }

  const body: unknown = await res.json().catch(() => null)
  if (isRecord(body) && body.ok === true && typeof body.hex === 'string' && isRecord(body.size)) {
    const s = body.size
    return {
      ok: true,
      hex: body.hex,
      cached: body.cached === true,
      size: { flash: Number(s.flash) || 0, ram: Number(s.ram) || 0, flashMax: Number(s.flashMax) || 0, ramMax: Number(s.ramMax) || 0 },
    }
  }
  if (isRecord(body) && body.ok === false) {
    const known = ['rejected', 'compile', 'timeout', 'busy', 'unavailable', 'rate_limited'] as const
    const reason = known.find((r) => r === body.reason) ?? 'unavailable'
    return { ok: false, reason, diagnostics: diagnostics(body.diagnostics), message: typeof body.message === 'string' ? body.message : undefined }
  }
  if (res.status === 413) return fail('rejected', 'Kode terlalu panjang')
  if (res.status === 404) return fail('unavailable', 'Server kompilasi belum dijalankan')
  return fail('unavailable', 'Jawaban server tidak dikenali')
}

/** One line to show the user when a compile did not succeed. */
export function failureText(r: Extract<CompileResponse, { ok: false }>): string {
  const first = r.diagnostics.find((d) => d.severity === 'error')
  if (first) return `Baris ${first.line}: ${first.message}`
  return r.message ?? 'Kompilasi gagal'
}
