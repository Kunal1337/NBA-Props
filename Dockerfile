FROM node:20-slim

# nba_api (the WNBA data source) needs Python3 + pip — Render's native
# Node environment doesn't reliably provide these, so we install them
# explicitly in the image instead of relying on the host.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Backend/package*.json ./
RUN npm install --omit=dev

COPY Backend/python/requirements.txt ./python/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r python/requirements.txt

COPY Backend/ .

CMD ["node", "index.js"]
