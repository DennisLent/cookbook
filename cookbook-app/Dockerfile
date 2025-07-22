# build stage
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build --production

# production stage
FROM nginx:alpine
COPY --from=build /app/dist/cookbook-app /usr/share/nginx/html
COPY ../nginx/nginx.conf /etc/nginx/nginx.conf
