FROM python:3.12.9-slim
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy the entire mcp project
COPY . .

# Install dependencies
RUN uv pip install --system -r requirements.txt

ENV PYTHONPATH="/app"
ENV MCP_HOST="0.0.0.0"
ENV MCP_PORT="8082"

EXPOSE 8082

CMD ["python", "-m", "public_server.server"]
