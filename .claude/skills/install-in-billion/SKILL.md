---
name: install-in-billion
description: Проверяемое обновление SdamEx на опубликованную версию библиотеки.
disable-model-invocation: true
argument-hint: "<X.Y.Z>"
category: release
---

# Установка в SdamEx

Прочитай AGENTS.md форка и актуальные инструкции потребителя. Найди его checkout по окружению; не переключай общий рабочий каталог или сессию коллеги.

1. Проверь точную опубликованную версию, release SHA и publish run.
2. Прочитай текущую dependency и lockfile потребителя: возможен URL tarball.
3. Для tarball используй артефакт проверенного release SHA. Локальный npm pack допустим после чистой сборки этой версии и проверки package metadata/dist.
4. Upload в Object Storage выполняется только в соответствующем scope. Bucket/profile возьми из текущих инструкций потребителя. Используй явный profile команды, не меняй общий активный профиль машины. Уже существующий URL версии не перезаписывай. Скачай обратно и сравни байты и SHA-512/integrity.
5. В отдельном checkout/ветке потребителя обнови dependency и lockfile штатным пакетным менеджером. Не разделяй node_modules с другой сессией.
6. Выполни frontend gates из его AGENTS.md и контракт docs/agent-development.md форка. Зелёная сборка библиотеки не заменяет typecheck потребителя.
7. Commit/PR — по правилам потребителя, затем его штатный release flow. Публикация пакета сама по себе не разрешает deployment SdamEx.
8. Receipt: версия/URL/integrity → release SHA → consumer commit/PR → checks. Непроведённую device QA укажи отдельно.

EPERM исправляй через процессы своей задачи, не остановкой чужого сервера. Не удаляй общие caches/node_modules для устранения проблемы чужого checkout.
