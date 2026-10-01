FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY hitchly ./hitchly
RUN pip install --no-cache-dir . && useradd -r -u 10001 hitchly && mkdir /data && chown hitchly /data
USER hitchly
ENV HITCHLY_HOST=0.0.0.0 HITCHLY_PORT=8080 HITCHLY_DB=/data/hitchly.db
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/health')"
CMD ["python", "-m", "hitchly", "serve"]
