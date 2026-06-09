FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-package-lock --quiet

FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
COPY src ./src
COPY public ./public
RUN npx prisma generate
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
