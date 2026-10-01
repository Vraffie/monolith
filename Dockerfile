FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY shortener ./shortener
RUN pip install --no-cache-dir . && useradd -r -u 10001 linkly && mkdir /data && chown linkly /data
USER linkly
ENV LINKLY_HOST=0.0.0.0 LINKLY_PORT=8080 LINKLY_DB=/data/linkly.db
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/health')"
CMD ["python", "-m", "shortener", "serve"]
