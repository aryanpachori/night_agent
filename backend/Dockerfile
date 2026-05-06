FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first to leverage Docker layer cache.
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund && npm cache clean --force

# Copy source and generate Prisma client for runtime.
COPY . .
ARG DATABASE_URL=postgresql://nightagent:nightagent@localhost:5432/night_agent
ENV DATABASE_URL=${DATABASE_URL}
RUN npx prisma generate

USER node
EXPOSE 4000

CMD ["npm", "start"]
