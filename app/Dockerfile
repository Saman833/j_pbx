FROM node:20-alpine

WORKDIR /app

COPY . /workspace
RUN if [ -f /workspace/package.json ]; then \
      cp /workspace/package*.json /app/ && \
      cp -r /workspace/. /app/; \
    elif [ -f /workspace/app/package.json ]; then \
      cp /workspace/app/package*.json /app/ && \
      cp -r /workspace/app/. /app/; \
    else \
      echo "package.json not found in build context" && exit 1; \
    fi && \
    npm install --omit=dev

EXPOSE 3000 3001

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "app.js"]
