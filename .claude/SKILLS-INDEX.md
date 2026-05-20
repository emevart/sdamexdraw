# Skills Index -- SdamExDraw fork

> Discovery index for `.claude/skills/`. Fork-specific operations. 3 skills.

## release (3 skills)

| Skill | Description |
| --- | --- |
| `/sync-upstream [fetch\|cherry-pick <sha>\|tag <upstream-tag>\|merge]` | Merge upstream `excalidraw/excalidraw`. По умолчанию cherry-pick критичных fix'ов, НЕ full merge |
| `/publish [patch\|minor\|major\|<X.Y.Z>] [--debug]` | Release `@emevart/excalidraw` -- bump + CHANGELOG + tag + verify CI |
| `/install-in-billion <X.Y.Z>` | Install опубликованной версии в `H:\billion-dollars\apps\frontend\` + commit обоих lock-файлов |

## Composition pattern

Типичный release sequence:

1. `/publish patch` -- bump + tag в форке
2. Дождаться CI green (`gh run watch`)
3. `/install-in-billion X.Y.Z` -- install в основной репо + PR develop → main

## Hooks (PreToolUse safety)

| Hook | Что блокирует |
| --- | --- |
| `block-force-push-master.sh` | force-push на master (любая форма: `--force`, `-f`, `+master` refspec, bare `git push --force`) |
| `block-rm-rf-critical.sh` | `rm -rf` на packages/, e2e/, scripts/, dev-docs/, docs/, .git, examples/, excalidraw-app/, public/ |
| `warn-publish-without-changelog.sh` | WARN (не block) при `git tag v*` или `git push --tags` без CHANGELOG.md в последнем коммите |

PostToolUse hooks существующие (от upstream/founder setup):

- `eslint-fix.sh` -- autofix на Write/Edit
- `check-changelog.sh` -- проверка после Bash

## File locations

- **SKILL.md** -- frontmatter (name, description, category, argument-hint) + body
- **Hooks** -- bash scripts, registered в `.claude/settings.json` под `hooks.PreToolUse` / `PostToolUse`
- **Settings** -- `.claude/settings.json` (committed), `.claude/settings.local.json` (gitignored, machine-specific)

## Связь с основным репо

Основной репо (`H:\billion-dollars`) имеет 16 skills для разных операций. Здесь -- только 3 fork-specific. При работе с whiteboard feature в основном репо:

- См. `H:\billion-dollars\apps\frontend\features\whiteboard\CLAUDE.md`
- Skills из основного репо НЕ доступны здесь (separate `.claude/`)
