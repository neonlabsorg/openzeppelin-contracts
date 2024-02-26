FROM node:18-slim

RUN apt-get update && apt-get install -y \
    python3 make g++ wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm set audit false && \
    npm ci 

COPY . ./
