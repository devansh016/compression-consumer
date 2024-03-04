FROM node:18-alpine

WORKDIR /app

# Install ffmpeg
RUN apk --no-cache add ffmpeg

COPY package.json /app
COPY .env /app
RUN npm install
COPY . /app

CMD node index.js
