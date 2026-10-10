# DSVP backend — Node API + the compilers/interpreters it spawns to run user code
# (python3, javac/java, gcc, g++). Build context = this backend/ folder.
FROM node:20-bookworm-slim

# Toolchains used by src/services/compilerService.js.
# python-is-python3 provides the plain `python` command the service looks for.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      default-jdk-headless gcc g++ libc6-dev python3 python-is-python3 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Run as an unprivileged user — this server executes user-submitted code.
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

ENV NODE_ENV=production
# Hosts like Render inject PORT themselves; set PORT=7860 on Hugging Face Spaces.
EXPOSE 5050

CMD ["node", "src/server.js"]
