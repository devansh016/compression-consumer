FROM node:18-alpine

WORKDIR /app

# Install ffmpeg
RUN apk --no-cache add ffmpeg

# Set environment variable
# ENV MY_VARIABLE_NAME=my_variable_value

COPY package.json /app
RUN npm install
COPY . /app

CMD node index.js
