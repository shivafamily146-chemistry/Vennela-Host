FROM eclipse-temurin:25-jre-noble
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/server.js ./server.js
COPY index.html style.css app.js ./public/
RUN mkdir -p /data/server && chown -R nobody:nogroup /app /data
USER nobody
ENV PORT=3000 SERVER_DIR=/data/server SERVER_JAR=server.jar JAVA_ARGS="-Xms1G -Xmx3G"
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["npm","start"]