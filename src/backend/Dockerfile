FROM python:3.12.9-slim
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY . .
RUN uv sync --no-dev
RUN chmod +x start.sh

ENV PATH="/app/.venv/bin:$PATH"
CMD ["./start.sh"]
