FROM node:20-alpine AS build

WORKDIR /app

# Install against the lockfile first so the layer is cached across source edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines these at build time, so they must be present now, not at runtime.
ARG VITE_API_URL=http://localhost:8000/api
ARG VITE_WS_URL=ws://localhost:8000/ws
ENV VITE_API_URL=$VITE_API_URL \
    VITE_WS_URL=$VITE_WS_URL

RUN npm run build


FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html

# The nginx entrypoint renders everything under templates/ with envsubst, which
# is how ${PORT} reaches the listen directive. Railway overrides PORT; the
# default keeps `docker run -p 8080:80` working unchanged.
ENV PORT=80
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
