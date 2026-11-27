# Worker host image (plan 0A: Docker images for api, mcp, workers, ml; host is H2: Railway or Fly).
# Build from the repo root:  docker build -f apps/workers/Dockerfile -t founders-workers .
# Run:                       docker run -e DATABASE_URL=… -e REDIS_URL=… -p 8080:8080 founders-workers
FROM node:22-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NODE_ENV=production
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@founders/workers..."
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@founders/workers", "start"]
