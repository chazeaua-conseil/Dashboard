import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, Prio, Project, Status, Task } from '../types'

const PANE = 'mon-accueil'
const TITLE = 'Mon accueil'
const STORE_KEY = 'board'
const TOOL = 'mcp__mon-accueil__tableau'

const EMPTY: Board = { tasks: [], projects: [], notes: [] }
// Changer le tag si la forme de Board change : l'ancienne valeur est alors ignorée.
const board = atom({ plugin: 'mon-accueil', key: 'board' } as const, EMPTY, { shape: 'board-1' })
const view = atom({ plugin: 'mon-accueil', key: 'view' } as const, 'taches' as 'taches' | 'projets' | 'notes')

const STATUS: Record<Status, string> = { 'en-cours': 'En cours', 'en-pause': 'En pause', termine: 'Terminé' }
const NEXT_STATUS: Record<Status, Status> = { 'en-cours': 'en-pause', 'en-pause': 'termine', termine: 'en-cours' }
const PRIO_RANK: Record<Prio, number> = { haute: 0, normale: 1, basse: 2 }

/* ---------- dates ---------- */
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = () => iso(new Date())
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T12:00:00`)
  d.setDate(d.getDate() + n)
  return iso(d)
}
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const JOURS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const fmtDay = (s: string) => {
  const d = new Date(`${s}T12:00:00`)
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`
}
const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)
}
const dueLabel = (due: string): { text: string; late: boolean; soon: boolean } | null => {
  if (!due) return null
  const t = today()
  if (due < t) return { text: `en retard (${fmtDay(due)})`, late: true, soon: false }
  if (due === t) return { text: "aujourd'hui", late: false, soon: true }
  if (due === addDays(t, 1)) return { text: 'demain', late: false, soon: false }
  return { text: fmtDay(due), late: false, soon: false }
}

/* ---------- saisie rapide : « Relire la note !haute @site 15/11 » ---------- */
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
function findProject(b: Board, name: string): Project | undefined {
  const n = name.trim().toLowerCase()
  if (!n) return undefined
  return b.projects.find(p => p.id === name) ?? b.projects.find(p => p.name.toLowerCase().startsWith(n)) ?? b.projects.find(p => p.name.toLowerCase().includes(n))
}
function parseDue(s: string): string {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : new Date().getFullYear()
    return `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const low = s.toLowerCase()
  if (low === "aujourd'hui" || low === 'auj') return today()
  if (low === 'demain') return addDays(today(), 1)
  return ''
}
function parseTask(b: Board, raw: string): Task | null {
  let prio: Prio = 'normale'
  let project = ''
  let due = ''
  const words: string[] = []
  for (const w of raw.trim().split(/\s+/)) {
    if (w === '!' || w === '!haute' || w === '!!') prio = 'haute'
    else if (w === '!basse') prio = 'basse'
    else if (w.startsWith('@') && w.length > 1 && findProject(b, w.slice(1))) project = findProject(b, w.slice(1))!.id
    else if (parseDue(w)) due = parseDue(w)
    else words.push(w)
  }
  const text = words.join(' ')
  return text ? { id: uid('t'), text, done: false, prio, project, due } : null
}

/* ---------- résumé texte, pour Claude et les commandes ---------- */
function summary(b: Board): string {
  const t = today()
  const name = (id: string) => b.projects.find(p => p.id === id)?.name
  const open = sortTasks(b.tasks.filter(x => !x.done))
  const lines = [`Aujourd'hui : ${t}`, '', `TÂCHES À FAIRE (${open.length})`]
  for (const x of open) {
    const bits = [x.prio !== 'normale' ? `priorité ${x.prio}` : '', x.due ? `échéance ${x.due}${x.due < t ? ' EN RETARD' : ''}` : '', name(x.project) ? `projet ${name(x.project)}` : '']
    lines.push(`- [${x.id}] ${x.text}${bits.some(Boolean) ? ` (${bits.filter(Boolean).join(', ')})` : ''}`)
  }
  const done = b.tasks.filter(x => x.done)
  if (done.length) lines.push(`(${done.length} tâche(s) terminée(s) : ${done.map(x => x.text).join(' ; ')})`)
  lines.push('', `PROJETS (${b.projects.length})`)
  for (const p of b.projects) {
    const ts = b.tasks.filter(x => x.project === p.id)
    lines.push(`- [${p.id}] ${p.name} : ${STATUS[p.status]}, ${ts.filter(x => x.done).length}/${ts.length} tâches${p.next ? `, prochaine étape : ${p.next}` : ''}`)
  }
  lines.push('', `NOTES (${b.notes.length})`)
  for (const n of b.notes) lines.push(`- [${n.id}] (${n.at.slice(0, 10)}) ${n.text.replace(/\n/g, ' / ')}`)
  return lines.join('\n')
}
function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const da = a.due || '9999'
    const db = b.due || '9999'
    if (da !== db) return da < db ? -1 : 1
    return PRIO_RANK[a.prio] - PRIO_RANK[b.prio]
  })
}

async function change($: EngineInterface, fn: (b: Board) => Board): Promise<Board> {
  await update($, board, fn)
  const b = await read($, board)
  await $.store.set(STORE_KEY, b)
  return b
}
async function addTask($: EngineInterface, raw: string): Promise<Task | null> {
  let added: Task | null = null
  await change($, b => {
    added = parseTask(b, raw)
    return added ? { ...b, tasks: [...b.tasks, added] } : b
  })
  return added
}
async function addNote($: EngineInterface, text: string): Promise<Board> {
  return change($, b => ({ ...b, notes: [{ id: uid('n'), text: text.trim(), at: new Date().toISOString() }, ...b.notes] }))
}
async function addProject($: EngineInterface, name: string, next = ''): Promise<Board> {
  return change($, b => ({ ...b, projects: [...b.projects, { id: uid('p'), name: name.trim(), status: 'en-cours', next }] }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Recharge le tableau enregistré lors des sessions précédentes.
    const { version } = await $.state.get({ plugin: 'mon-accueil', key: 'board' })
    if (version === 0) {
      const saved = (await $.store.get(STORE_KEY)) as Board | undefined
      if (saved && Array.isArray(saved.tasks)) await update($, board, () => ({ ...EMPTY, ...saved }))
    }

    await $.command.register({ name: 'accueil', description: 'Ouvrir mon panneau d’accueil (tâches, projets, notes)' })
    await $.command.register({ name: 'tache', description: 'Ajouter une tâche : /tache Relire la note !haute @Projet 15/11' })
    await $.command.register({ name: 'note', description: 'Ajouter une note : /note texte' })
    await $.command.register({ name: 'projet', description: 'Créer un projet : /projet Nom du projet' })
    await $.tool.register({
      name: 'tableau',
      isDeferred: false,
      description:
        "Le tableau d'accueil personnel de l'utilisateur : ses tâches à faire, ses projets en cours et ses notes, affichés dans un panneau à côté de la conversation. " +
        "Utilise-le dès que l'utilisateur parle de ses tâches, de sa journée, de ses projets ou de ses notes, ou demande de noter, d'ajouter, de terminer ou de supprimer quelque chose. " +
        "action « lire » renvoie tout le tableau avec les identifiants entre crochets. " +
        "« ajouter_tache » prend texte (saisie rapide acceptée : « !haute », « !basse », « @DébutDuNomDeProjet », une date « 15/11 » ou « demain »), et en option priorite, projet (id ou nom), echeance (AAAA-MM-JJ). " +
        "« terminer_tache » et « supprimer » prennent id. « ajouter_note » prend texte. « ajouter_projet » prend texte (le nom) et en option etape. " +
        "« modifier_projet » prend id et en option statut (en-cours, en-pause, termine) et etape.",
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['lire', 'ajouter_tache', 'terminer_tache', 'ajouter_note', 'ajouter_projet', 'modifier_projet', 'supprimer'] },
          texte: { type: 'string' },
          id: { type: 'string' },
          priorite: { type: 'string', enum: ['haute', 'normale', 'basse'] },
          projet: { type: 'string' },
          echeance: { type: 'string' },
          statut: { type: 'string', enum: ['en-cours', 'en-pause', 'termine'] },
          etape: { type: 'string' },
        },
        required: ['action'],
      },
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  /* ---------- commandes slash ---------- */
  on('command.run', { command: 'accueil' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    return { text: 'Panneau « Mon accueil » ouvert.' }
  })
  on('command.run', { command: 'tache' }, async ($, e) => {
    const t = await addTask($, e.args)
    return { text: t ? `Tâche ajoutée : ${t.text}` : 'Écris le texte de la tâche après /tache.' }
  })
  on('command.run', { command: 'note' }, async ($, e) => {
    if (!e.args.trim()) return { text: 'Écris le texte de la note après /note.' }
    await addNote($, e.args)
    return { text: 'Note ajoutée.' }
  })
  on('command.run', { command: 'projet' }, async ($, e) => {
    if (!e.args.trim()) return { text: 'Écris le nom du projet après /projet.' }
    await addProject($, e.args)
    return { text: `Projet créé : ${e.args.trim()}` }
  })

  /* ---------- l'outil que Claude appelle ---------- */
  on('tool.call', { tool: TOOL }, async ($, e) => {
    const a = e as unknown as {
      action: string; texte?: string; id?: string; priorite?: Prio; projet?: string; echeance?: string; statut?: Status; etape?: string
    }
    const b0 = await read($, board)
    const exists = (id?: string) => !!id && (b0.tasks.some(x => x.id === id) || b0.projects.some(x => x.id === id) || b0.notes.some(x => x.id === id))
    switch (a.action) {
      case 'lire':
        return { result: summary(b0) }
      case 'ajouter_tache': {
        if (!a.texte?.trim()) return { result: 'Erreur : texte manquant.' }
        let added: Task | null = null
        const b = await change($, cur => {
          const t = parseTask(cur, a.texte!)
          if (!t) return cur
          if (a.priorite) t.prio = a.priorite
          if (a.echeance) t.due = parseDue(a.echeance) || t.due
          if (a.projet) t.project = findProject(cur, a.projet)?.id ?? t.project
          added = t
          return { ...cur, tasks: [...cur.tasks, t] }
        })
        return { result: added ? `Tâche ajoutée.\n\n${summary(b)}` : 'Erreur : texte vide.' }
      }
      case 'terminer_tache': {
        if (!b0.tasks.some(x => x.id === a.id)) return { result: `Erreur : aucune tâche ${a.id}. Appelle « lire » pour voir les identifiants.` }
        const b = await change($, cur => ({ ...cur, tasks: cur.tasks.map(x => (x.id === a.id ? { ...x, done: true } : x)) }))
        return { result: `Tâche terminée.\n\n${summary(b)}` }
      }
      case 'ajouter_note': {
        if (!a.texte?.trim()) return { result: 'Erreur : texte manquant.' }
        const b = await addNote($, a.texte)
        return { result: `Note ajoutée.\n\n${summary(b)}` }
      }
      case 'ajouter_projet': {
        if (!a.texte?.trim()) return { result: 'Erreur : nom manquant.' }
        const b = await addProject($, a.texte, a.etape ?? '')
        return { result: `Projet créé.\n\n${summary(b)}` }
      }
      case 'modifier_projet': {
        if (!b0.projects.some(p => p.id === a.id)) return { result: `Erreur : aucun projet ${a.id}.` }
        const b = await change($, cur => ({
          ...cur,
          projects: cur.projects.map(p => (p.id === a.id ? { ...p, status: a.statut ?? p.status, next: a.etape ?? p.next } : p)),
        }))
        return { result: `Projet modifié.\n\n${summary(b)}` }
      }
      case 'supprimer': {
        if (!exists(a.id)) return { result: `Erreur : aucun élément ${a.id}.` }
        const b = await change($, cur => ({
          tasks: cur.tasks.filter(x => x.id !== a.id).map(x => (x.project === a.id ? { ...x, project: '' } : x)),
          projects: cur.projects.filter(x => x.id !== a.id),
          notes: cur.notes.filter(x => x.id !== a.id),
        }))
        return { result: `Supprimé.\n\n${summary(b)}` }
      }
      default:
        return { result: `Erreur : action inconnue « ${a.action} ».` }
    }
  })

  /* ---------- le panneau ---------- */
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const b = await read($, board)
    const tab = await read($, view)
    const now = new Date()
    const t = today()
    const open = sortTasks(b.tasks.filter(x => !x.done))
    const late = open.filter(x => x.due && x.due < t).length
    const todayN = open.filter(x => x.due === t).length
    const active = b.projects.filter(p => p.status === 'en-cours').length
    const doneN = b.tasks.length - open.length
    const projName = (id: string) => b.projects.find(p => p.id === id)?.name

    const tabs = (
      <Box flexDirection="row" gap={1}>
        <Button key="tab-taches" variant={tab === 'taches' ? 'primary' : 'secondary'} onPress={() => update($, view, () => 'taches')}>
          {`Tâches ${open.length}`}
        </Button>
        <Button key="tab-projets" variant={tab === 'projets' ? 'primary' : 'secondary'} onPress={() => update($, view, () => 'projets')}>
          {`Projets ${b.projects.length}`}
        </Button>
        <Button key="tab-notes" variant={tab === 'notes' ? 'primary' : 'secondary'} onPress={() => update($, view, () => 'notes')}>
          {`Notes ${b.notes.length}`}
        </Button>
      </Box>
    )

    let body
    if (tab === 'taches') {
      body = (
        <Box flexDirection="column" gap={1}>
          <Input
            key="new-task"
            placeholder="Nouvelle tâche  (!haute  @projet  15/11)"
            submitLabel="ajouter"
            onSubmit={v => void addTask($, v)}
          />
          {open.length === 0 && <Text dimColor>Rien à faire. Ajoute une tâche ci-dessus ou demande-le à Claude.</Text>}
          {open.map(x => {
            const d = dueLabel(x.due)
            const meta = [d?.text, projName(x.project), x.prio === 'haute' ? 'priorité haute' : x.prio === 'basse' ? 'priorité basse' : ''].filter(Boolean).join(' · ')
            return (
              <Box flexDirection="row" gap={1}>
                <Button key={`done-${x.id}`} plain label="Marquer comme faite" onPress={() => change($, cur => ({ ...cur, tasks: cur.tasks.map(y => (y.id === x.id ? { ...y, done: true } : y)) }))}>
                  {'☐'}
                </Button>
                <Box flexDirection="column" flexGrow={1}>
                  <Text bold={x.prio === 'haute'} wrap="wrap">{x.text}</Text>
                  {meta && <Text dimColor={!d?.late && !d?.soon} color={d?.late ? 'red' : d?.soon ? 'yellow' : undefined} size="footnote">{meta}</Text>}
                </Box>
                <Button key={`del-${x.id}`} plain dimColor label="Supprimer la tâche" onPress={() => change($, cur => ({ ...cur, tasks: cur.tasks.filter(y => y.id !== x.id) }))}>
                  {'✕'}
                </Button>
              </Box>
            )
          })}
          {doneN > 0 && (
            <Button key="clear-done" plain dimColor onPress={() => change($, cur => ({ ...cur, tasks: cur.tasks.filter(y => !y.done) }))}>
              {`Effacer ${doneN} tâche${doneN > 1 ? 's' : ''} terminée${doneN > 1 ? 's' : ''}`}
            </Button>
          )}
        </Box>
      )
    } else if (tab === 'projets') {
      const order: Status[] = ['en-cours', 'en-pause', 'termine']
      const list = [...b.projects].sort((p, q) => order.indexOf(p.status) - order.indexOf(q.status))
      body = (
        <Box flexDirection="column" gap={1}>
          {list.length === 0 && <Text dimColor>Aucun projet pour l'instant.</Text>}
          {list.map(p => {
            const ts = b.tasks.filter(x => x.project === p.id)
            const dn = ts.filter(x => x.done).length
            const width = 12
            const fill = ts.length ? Math.round((dn / ts.length) * width) : 0
            return (
              <Box flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  <Box flexGrow={1}>
                    <Text bold dimColor={p.status === 'termine'} wrap="wrap">{p.name}</Text>
                  </Box>
                  <Button key={`st-${p.id}`} plain label="Changer le statut" onPress={() => change($, cur => ({ ...cur, projects: cur.projects.map(q => (q.id === p.id ? { ...q, status: NEXT_STATUS[q.status] } : q)) }))}>
                    <Text color={p.status === 'en-cours' ? 'green' : p.status === 'en-pause' ? 'yellow' : undefined} dimColor={p.status === 'termine'}>{STATUS[p.status]}</Text>
                  </Button>
                  <Button key={`delp-${p.id}`} plain dimColor label="Supprimer le projet" onPress={() => change($, cur => ({ ...cur, projects: cur.projects.filter(q => q.id !== p.id), tasks: cur.tasks.map(x => (x.project === p.id ? { ...x, project: '' } : x)) }))}>
                    {'✕'}
                  </Button>
                </Box>
                <Text dimColor mono size="footnote">{`${'█'.repeat(fill)}${'░'.repeat(width - fill)} ${dn}/${ts.length} tâche${ts.length > 1 ? 's' : ''}`}</Text>
                {p.next && <Text size="footnote" wrap="wrap">{`→ ${p.next}`}</Text>}
              </Box>
            )
          })}
          <Input key="new-project" placeholder="Nouveau projet" submitLabel="créer" onSubmit={v => { if (v.trim()) void addProject($, v) }} />
        </Box>
      )
    } else {
      body = (
        <Box flexDirection="column" gap={1}>
          <Input key="new-note" rows={3} placeholder="Une idée, un point à retenir…" submitLabel="ajouter" onSubmit={v => { if (v.trim()) void addNote($, v) }} />
          {b.notes.length === 0 && <Text dimColor>Aucune note.</Text>}
          {b.notes.map(n => {
            const d = new Date(n.at)
            return (
              <Box flexDirection="column" borderStyle="round" paddingX={1}>
                <Text wrap="wrap">{n.text}</Text>
                <Box flexDirection="row" gap={1}>
                  <Box flexGrow={1}>
                    <Text dimColor size="footnote">{`${d.getDate()} ${MOIS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`}</Text>
                  </Box>
                  <Button key={`deln-${n.id}`} plain dimColor label="Supprimer la note" onPress={() => change($, cur => ({ ...cur, notes: cur.notes.filter(x => x.id !== n.id) }))}>
                    {'✕'}
                  </Button>
                </Box>
              </Box>
            )
          })}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text size="heading" weight="semibold">{`${JOURS_LONG[now.getDay()]} ${now.getDate()} ${MOIS_LONG[now.getMonth()]} · semaine ${isoWeek(now)}`}</Text>
          <Text dimColor size="footnote">
            {`${open.length} à faire · ${todayN} aujourd'hui · `}
            <Text color={late ? 'red' : undefined} dimColor={!late}>{`${late} en retard`}</Text>
            {` · ${active} projet${active > 1 ? 's' : ''} actif${active > 1 ? 's' : ''}`}
          </Text>
        </Box>
        {tabs}
        {body}
      </Box>
    )
  })
}
