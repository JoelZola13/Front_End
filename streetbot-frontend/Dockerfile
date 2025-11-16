# syntax=docker/dockerfile:1.7

FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY frontend_reference/streetbot-frontend/package.json frontend_reference/streetbot-frontend/package-lock.json ./
RUN npm install --legacy-peer-deps

# Copy project files
COPY frontend_reference/streetbot-frontend .

# Build the Next.js app
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
