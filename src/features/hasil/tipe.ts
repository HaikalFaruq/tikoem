import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'

type HasilLihat = Extract<FunctionReturnType<typeof api.room.lihat>, { ok: true }>

export type Room = HasilLihat['room']
export type Peserta = HasilLihat['peserta'][number]
export type Kandidat = HasilLihat['kandidat'][number]
