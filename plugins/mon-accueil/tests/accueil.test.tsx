import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'mon-accueil',
  component: 'Pane',
  requestId: 'mon-accueil',
  props: { title: 'Mon accueil', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('Claude ajoute une tâche et une note, le panneau les affiche', async ($, on) => {
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__mon-accueil__tableau' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.tool.call({ tool: 'mcp__mon-accueil__tableau', action: 'ajouter_projet', texte: 'Site web' } as never)
  const r = await $.tool.call({ tool: 'mcp__mon-accueil__tableau', action: 'ajouter_tache', texte: 'Envoyer le devis !haute @site demain' } as never)
  expect(String((r as { result: unknown }).result)).toContain('Envoyer le devis (priorité haute')
  await $.tool.call({ tool: 'mcp__mon-accueil__tableau', action: 'ajouter_note', texte: 'Appeler le comptable' } as never)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Envoyer le devis/ }))?.text).toBe('Envoyer le devis')
    expect((await ui.find({ type: 'Text', text: /demain · Site web/ }))?.text).toContain('priorité haute')
    await ui.press({ key: 'tab-notes' } as never)
    expect((await ui.find({ type: 'Text', text: /Appeler le comptable/ }))?.text).toBe('Appeler le comptable')
    await ui.press({ key: 'tab-taches' } as never)
    await ui.unmount()
  }
})
