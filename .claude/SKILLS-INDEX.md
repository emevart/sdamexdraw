# Процедуры SdamExDraw

- [sync-upstream](skills/sync-upstream/SKILL.md): выборочный перенос fixes.
- [publish](skills/publish/SKILL.md): выпуск через tag pipeline.
- [install-in-billion](skills/install-in-billion/SKILL.md): отдельное обновление потребителя.

Claude использует .claude/skills/, Codex — тонкие .agents/skills/ адаптеры. Наличие процедуры не запускает её и не даёт разрешения на внешнее действие. Шаги publish → установка → release потребителя связываются точными SHA/версиями. Hooks в .claude/settings.json работают в Claude и не заменяют gates. Фактическую branch protection проверяют отдельно: hook её не настраивает.
