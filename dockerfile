# ============================================
# BUILD STAGE
# ============================================
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Node heap-korlat a buildhez.
#
# 8192-rol csokkentve: a CT-ben OSSZESEN 8 GB van, tehat a 8 GB-os heap-plafon a
# gyakorlatban azt jelentette, hogy a Node addig nott, amig a rendszer ki nem lotte -
# az Angular 22-re frissites utan a build "Error: The service was stopped"-dal
# hasalt el (az esbuild munkafolyamatat OOM-ra kilottek).
#
# A 4096 boven eleg: ugyanez a produkcios build helyben MEG SZUKEBB, 3584 MB-os
# korlat alatt is atment.
ENV NODE_OPTIONS="--max_old_space_size=4096"

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
# UI-TT-159: a biztonsági fejlécek külön fájlban élnek, mert MINDEN location blokknak
# include-olnia kell (az nginx add_header-öröklődési szabálya miatt) — ha ez a COPY
# kimarad, az nginx indulásakor azonnal elhasal a hiányzó include-on, nem csendben.
COPY security-headers.inc /etc/nginx/conf.d/security-headers.inc

# Fix sendfile issue in main nginx.conf
RUN sed -i 's/sendfile on;/sendfile off;/g' /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:80/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
