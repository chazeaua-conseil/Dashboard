# Mon accueil

Un panneau d'accueil pour Claude Code, affiché à côté de la conversation :

- **Tâches** : ajout rapide (`Envoyer le devis !haute @site 15/11`), échéances, priorités, tâches en retard signalées ;
- **Projets en cours** : statut (En cours, En pause, Terminé), progression calculée sur les tâches, prochaine étape ;
- **Notes** : prises à la volée, datées.

Claude dispose d'un outil pour lire et modifier ce tableau : demande-lui « qu'est-ce que j'ai aujourd'hui ? » ou « note que je dois rappeler Paul vendredi ».

Commandes : `/accueil` (ouvrir le panneau), `/tache …`, `/note …`, `/projet …`.

Saisie rapide d'une tâche : `!haute` ou `!basse` pour la priorité, `@début-du-nom-de-projet` pour la rattacher à un projet, `15/11` ou `demain` pour l'échéance.

## Installation

À l'invite d'une session Claude Code dans un terminal :

```
/plugin install mon-accueil --marketplace chazeaua-conseil/Dashboard
```

Réponds `y` pour ajouter le catalogue, puis choisis la portée « user » pour l'avoir dans toutes tes sessions.

Depuis un shell :

```
claude plugin install mon-accueil --marketplace chazeaua-conseil/Dashboard
```

Dans l'application desktop : clique sur **+** à côté de la zone de saisie, puis **Plugins**, **Add marketplace** avec `chazeaua-conseil/Dashboard`, puis **Add plugin**.

Si le dépôt est privé, la machine doit déjà avoir un accès git à github.com (clé SSH, ou `gh auth login` puis `gh auth setup-git`).

Les données sont gardées par Claude Code sur la machine où le plugin tourne.
