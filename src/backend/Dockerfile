FROM python:3.12.9-slim
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .
RUN chmod +x start.sh

ENV PATH="/app/.venv/bin:$PATH"
CMD ["./start.sh"]
