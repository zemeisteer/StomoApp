# StomoApp Telegram bot (aiogram v3, long polling)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first for layer caching
COPY requirements.txt /app/bot/requirements.txt
RUN pip install -r /app/bot/requirements.txt

# The code imports itself as the `bot` package, so it lives in /app/bot
COPY . /app/bot

RUN useradd --system --uid 10001 --no-create-home botuser
USER botuser

CMD ["python", "-m", "bot.main"]
