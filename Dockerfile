# ---- build ----
FROM mcr.microsoft.com/playwright:v1.58.0-jammy AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY index.ts .
RUN npm run build


# ---- runtime ----
FROM mcr.microsoft.com/playwright:v1.58.0-jammy AS runtime
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN chown -R pwuser:pwuser /app \
  && mkdir -p /home/pwuser/.cache \
  && chown -R pwuser:pwuser /home/pwuser

USER pwuser

CMD ["node", "dist/index.js"]
