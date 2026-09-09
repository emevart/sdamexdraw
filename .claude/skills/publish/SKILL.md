---
name: publish
description: Выпуск @emevart/excalidraw через штатный tag pipeline.
disable-model-invocation: true
argument-hint: "[patch|minor|major|<X.Y.Z>] [--debug]"
category: release
---

# Выпуск библиотеки

1. Прочитай AGENTS.md, checkpoint, package.json, publish.yml. Проверь свой checkout, origin/master и теги. Подготовку веди в отдельной ветке.
2. Версия определяется package.json/тегами и совместимостью. API break обсуждается явно; debug-версии не подменяют стабильную.
3. Выполни gates AGENTS.md и yarn --cwd packages/excalidraw build:esm. Корневой yarn build собирает демо. Не выпускай при неразобранном сбое.
4. Обнови package.json/CHANGELOG, проверь dist/exports, получи review и интегрируй подготовку в master по действующему поручению.
5. Зафиксируй точные VERSION/RELEASE_SHA и checks. До push должно быть разрешение на конкретный выпуск; уже данное повторно не требуется. Проверь отсутствие тега. Создай tag на проверенном SHA и push только его:

```text
git tag vX.Y.Z RELEASE_SHA
git push origin refs/tags/vX.Y.Z
```

X.Y.Z и RELEASE_SHA — подставляемые проверенные значения.

6. Дождись именно publish.yml нужного SHA/tag и проверь точную версию в GitHub Packages. Не force-push опубликованный tag.
7. При E403 диагностируй packages:write и политику пакета; локальный npm publish не является fallback. Не выводи токены.
8. Сохрани версию/SHA/tag/run URL/результат/остаток. Установка в SdamEx — отдельная процедура install-in-billion и отдельный scope.
