# ---- build ----
FROM mcr.microsoft.com/playwright:v1.58.0-jammy AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM mcr.microsoft.com/playwright:v1.58.0-jammy
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

CMD ["npm", "start"]
