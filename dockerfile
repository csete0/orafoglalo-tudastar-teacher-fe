# ============================================
# BUILD STAGE
# ============================================
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Increase Node memory
ENV NODE_OPTIONS="--max_old_space_size=8192"

# Install dependencies
RUN npm ci --force

# Copy source code
COPY . .

# Production build (statikus kiszolgálás, nincs SSR ebben a repóban)
RUN npm run build -- --configuration production

# ============================================
# PRODUCTION STAGE
# ============================================
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy built application (TRAILING SLASH!)
COPY --from=build /app/dist/teacher-fe/browser/ /usr/share/nginx/html/

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Fix sendfile issue in main nginx.conf
RUN sed -i 's/sendfile on;/sendfile off;/g' /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:80/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
