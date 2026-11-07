FROM node:24-alpine
WORKDIR /app
COPY server.mjs .
ARG VERSION=dev
ENV VERSION=$VERSION NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
