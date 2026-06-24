FROM python:3.12.9-slim
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# ffmpeg provides the `ffprobe` binary used to probe video metadata (clips).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY . .
RUN uv sync --no-dev
RUN chmod +x start.sh

# /app on the path so the `procrastinate --app=app.core...` CLI can import the
# app package (its console_script, unlike uvicorn, doesn't add cwd).
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app"
CMD ["./start.sh"]
