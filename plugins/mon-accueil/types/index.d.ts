export type Prio = 'haute' | 'normale' | 'basse'
export type Status = 'en-cours' | 'en-pause' | 'termine'
export type Task = { id: string; text: string; done: boolean; prio: Prio; project: string; due: string }
export type Project = { id: string; name: string; status: Status; next: string }
export type Note = { id: string; text: string; at: string }
export type Board = { tasks: Task[]; projects: Project[]; notes: Note[] }

declare module 'claude-code' {
  interface PluginState {
    'mon-accueil': { board: Shaped<Board>; view: 'taches' | 'projets' | 'notes' }
  }
}
