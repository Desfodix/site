# KaneiX — личный сайт (Docker)

Сайт с проектами и статьями на русском и английском, плюс админка для добавления записей.
Без зависимостей: только Node.js (в контейнере) и один HTML-файл.

## Запуск

```bash
cp .env.example .env      # задайте ADMIN_PASSWORD в .env
docker compose up -d --build
```

Сайт: http://localhost:8080
Админка: http://localhost:8080/#/admin (войдите по паролю из `.env`).

## Данные

Записи хранятся в томе `kaneix-data` (файл `content.json`), при пересборке не теряются.

```bash
# резервная копия
docker compose cp web:/data/content.json ./content.backup.json
# восстановление
docker compose cp ./content.backup.json web:/data/content.json
```

## Что поменять под себя

- Контакты (Telegram, GitHub, email), тексты «Обо мне» и подпись: `index.html`
- Акцентный цвет: переменная `--ac` в начале стилей
- Начальные примеры записей: `seed-content.json` (используются только при первом запуске)
- Порт: строка `8080:3000` в `docker-compose.yml`

После правки `index.html` пересоберите: `docker compose up -d --build`.

## В интернет

Поставьте перед контейнером обратный прокси с HTTPS (Caddy, Nginx, Traefik).
Пример для Caddy:

```
example.com {
    reverse_proxy localhost:8080
}
```

Вход в админку защищён паролем, ограничением попыток и cookie `HttpOnly` + `SameSite=Strict`.

## Структура

Все файлы лежат в корне, без вложенных папок: `Dockerfile`, `server.js`, `index.html`, `seed-content.json`.
Если заливаете в GitHub вручную, загрузите все эти файлы в корень репозитория (включая `index.html` и `seed-content.json`).
Контейнер работает от root, чтобы без проблем писать на примонтированный диск (`/data`).
