# SdamExDraw: инструкции агентам

Обновлено: 2026-09-09. Общий слой Claude Code и Codex — AGENTS.md и вложенные AGENTS.md. Соседние CLAUDE.md импортируют их.

Форк Excalidraw; React-библиотека @emevart/excalidraw для SdamEx. Origin — emevart/sdamexdraw, upstream — excalidraw/excalidraw. [Карта документации](docs/README.md), [проверки и адаптеры](docs/agent-development.md).

## Начало и инварианты

- Прочитай поручение, git status, ветку/HEAD и checkpoint. Текущие указания пользователя приоритетнее рекомендаций, ограничения инструментов сохраняются.
- Перед правкой читай AGENTS.md по области: packages/excalidraw, packages/common, e2e. Дочерние инструкции Codex открывает явно.
- packages/element, math, utils и common входят в библиотеку. excalidraw-app — upstream-демо; не меняй его без отдельного scope.
- До upstream sync читай [журнал](docs/upstream-sync.md). По умолчанию выборочные критичные fixes, полный merge не подразумевается.
- До touch/pointer в App.tsx читай [жесты](docs/touch-gestures.md). Автотесты не заменяют приёмку на устройстве.
- Сохраняй публичные типы, сериализацию сцен, undo/redo и fork patches. Изменение API требует проверки потребителя, не только сборки библиотеки.

## Работа и коллеги

- Независимые сессии ведут задачи в отдельных checkout/ветках; subagents получают узкое внутреннее задание. Один координатор согласует общие файлы и интеграцию. Малые связные задачи не дроби.
- Не переключай чужой checkout, не разделяй node_modules через symlink/junction. Зависимости устанавливай по lockfile только для необходимой проверки.
- Effort и масштаб review выбирай по риску. Существенную правку заверши независимым review. Значимый выбор дизайна показывай пользователю в чате.
- Перед сервером/браузером/сборкой оцени RAM/диск/порты и соседние задачи; не запускай автоматически несколько тяжёлых процессов и не останавливай чужие.
- После этапа сохрани [checkpoint](docs/checkpoint-template.md) рядом с планом: SHA, проверки, evidence, остаток, holds и следующий шаг.
- Побочные вопросы/гипотезы/дефекты/предложения фиксируй с evidence и статусом достоверности в checkpoint или backlog. Затем оцени влияние, проверь гипотезу, прими в задачу/backlog либо отложи/отклони с причиной. Не расширяй scope молча.

## Команды и Git

Yarn 1.22.22 закреплён в packageManager. Node сверяй с engines и CI; на дату аудита CI использует Node 20. Не меняй toolchain молча.

- Документы: git diff --check, ссылки/импорты, формат изменённых файлов.
- Код: yarn test:code (0 warnings), yarn test:typecheck, релевантные unit-тесты. yarn fix — изменяющий autofix, проверь его diff.
- Сборка библиотеки как в CI: yarn --cwd packages/excalidraw build:esm. Все пакеты: yarn build:packages. Корневой yarn build собирает демо.
- Unit без watch: yarn test:app --run. Историческое число failures не является waiver: сравни ту же команду на базе и изменении.
- Root script test:playwright и Playwright config отсутствуют; читай e2e/AGENTS.md.

Основная ветка master. Работу готовь на отдельной ветке (Codex: codex/), PR — в emevart/sdamexdraw. Прямой push master только в соответствующем поручении. Force-push master запрещён. ci.yml работает на push master, не PR; отсутствие PR checks не означает успех CI.

## Выпуск и потребитель

- CHANGELOG обязателен для поведения/выпуска; docs-only не требует bump пакета.
- Выпуск через publish.yml: точный v-тег на проверенном SHA. До push проверь версию, SHA, CHANGELOG, gates и действующее разрешение на этот выпуск. Уже данное разрешение сохраняется при handoff; повторное не нужно.
- Не push --tags. Локальный npm publish не является fallback при E403; диагностируй pipeline без обхода и вывода токенов.
- Установка в SdamEx — отдельная задача в его checkout с его AGENTS.md, lockfile, проверками и release flow. Публикация не разрешает менять работающий checkout потребителя.
- Процедуры: [.claude/SKILLS-INDEX.md](.claude/SKILLS-INDEX.md).

Проза по-русски, идентификаторы как в коде, без декоративных значков. Секреты, персональные модели/контекст/permissions и машинные пути не добавляй в shared config. Исторические логи — контекст, не текущее поручение.
