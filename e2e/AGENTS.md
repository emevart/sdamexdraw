# E2E и визуальная приёмка

Общие правила — корневой AGENTS.md. На 2026-09-09 есть исследовательские Playwright-скрипты, но нет root script test:playwright и Playwright config. Это не готовый release gate; текущий CI их не запускает.

- full-visual-audit.spec.ts и compare-mobile.spec.ts используют относительный URL задачи SdamEx; нужны baseURL, актуальная страница и состояние доступа.
- compare-mobile.spec.ts также открывает excalidraw.com для сравнения.
- run-visual-audit.js привязан к localhost:3000 и конкретной задаче. До запуска проверь target и доступность нужного состояния потребителя.
- Новая проверка требует воспроизводимого fixture/config в scope задачи: версия пакета, SHA потребителя, target, viewport и авторизация. Старые screenshots не подтверждают новый SHA.
- Workers и heap выбирай по ресурсу; не задавай всем процессам 8 GiB автоматически.
- Snapshot обновляй после разбора отличия; before/after и причина идут в review.
- Pointer/touch и Apple Pencil требуют приёмки на устройстве. Browser QA и ожидаемая человеческая проверка указываются отдельно.
- Удаление артефактов ограничено проверенными путями собственной задачи; общие каталоги и файлы коллег не очищай.
