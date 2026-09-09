---
name: sync-upstream
description: Выборочные upstream fixes с сохранением customizations форка.
disable-model-invocation: true
argument-hint: "[fetch|cherry-pick <sha>|tag <upstream-tag>|merge]"
category: dev
---

# Выборочная синхронизация

Сначала AGENTS.md, docs/upstream-sync.md и packages/excalidraw/AGENTS.md. Не разбирай повторно уже рассмотренные SHA без новой информации.

- fetch: проверь URL upstream, загрузи refs, предложи релевантные fixes. Fetch не означает разрешение merge/publish.
- cherry-pick: выбранные SHA переноси в отдельной ветке своего checkout, сохраняя hotkeys, touch.identifier, freedraw, presets, API и custom deps.
- tag/merge: полный merge требует отдельного согласованного scope и анализа совместимости. Нужный upstream tag загрузи в отдельный ref refs/remotes/upstream/tags/ИМЯ, не смешивай его с release tags форка. Не предполагай существование ref upstream/<tag>.

После переноса: review конфликтов, CHANGELOG для поведения, gates AGENTS.md и проверки затронутых customizations/потребителя. Touch требует device QA. Обнови журнал upstream-sync с исходами. PR — в master emevart/sdamexdraw. Publish выполняется отдельно; версия форка не выводится из номера upstream.
