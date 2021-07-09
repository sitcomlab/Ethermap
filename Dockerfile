FROM node:16-alpine as build

ENV http_proxy=http://wwwproxy.uni-muenster.de:3128
ENV https_proxy=http://wwwproxy.uni-muenster.de:3128
ENV no_proxy="localhost,127.0.0.1,0.0.0.0,.wwu.de,.uni-muenster.de,.wwu.io,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16"

# build dependencies for imagemin-gifsicle
RUN apk --update --no-cache \
		add  \
		automake \
		git \
		alpine-sdk  \
		nasm  \
		autoconf  \
		build-base \
		zlib \
		zlib-dev \
		libpng \
		libpng-dev\
		libwebp \
		libwebp-dev \
		libjpeg-turbo \
		libjpeg-turbo-dev

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm install && npm rebuild
COPY bower.json .bowerrc ./
RUN npm exec bower install --allow-root
COPY . ./
RUN npm run build


FROM node:16-alpine
ENV NODE_ENV=production
ENV PORT=8080
ENV http_proxy=http://wwwproxy.uni-muenster.de:3128
ENV https_proxy=http://wwwproxy.uni-muenster.de:3128
ENV no_proxy="couchdb,localhost,127.0.0.1,0.0.0.0,.wwu.de,.uni-muenster.de,.wwu.io,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16"
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/dist /usr/src/app
# this time, only install prod dependencies
RUN npm install
EXPOSE ${PORT}
CMD [ "node", "server.js" ]
