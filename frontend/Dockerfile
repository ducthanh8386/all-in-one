# Dockerfile for Frontend

FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Build Next.js
RUN npm run build

# Expose port
EXPOSE 3000

# Run production server. docker-compose.yml overrides this for local dev.
CMD ["npm", "run", "start"]
