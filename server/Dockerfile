FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install && npx prisma generate
COPY . .
EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/index.js"]
