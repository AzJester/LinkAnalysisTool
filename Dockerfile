FROM node:22-bookworm-slim AS web
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app
COPY requirements.txt requirements-lock.txt ./
RUN pip install --no-cache-dir -r requirements-lock.txt && useradd --create-home --uid 10001 app
COPY linkanalysis/ ./linkanalysis/
COPY --from=web /build/dist ./web/dist/
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8000')+'/api/health',timeout=4)"
CMD ["sh", "-c", "exec uvicorn linkanalysis.api:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --timeout-keep-alive 5 --limit-concurrency 100 --limit-max-requests 100000"]
