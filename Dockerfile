# Use official Node.js LTS image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies first (layer caching)
COPY package*.json ./
COPY patches/ ./patches/
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Create log directory
RUN mkdir -p log

# Expose the app port
EXPOSE 3033

# Start the app
CMD ["node", "./bin/www"]
